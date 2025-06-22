import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessTokenAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findOne(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // save the refresh token inside the database
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false}); // to prevent getting error for entering password again

        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
    }
}

const registerUser = asyncHandler(async (req, res) => {
    // Logic flow: 
    // 1. get user details from frontend from body(bcoz this will be sent through form)
    // 2. validation of data: check if any of the fields is empty
    // 3. check if the user already exists
    // 4. check for images, check for avatar
    // 5. upload them to cloudinary, avatar
    // 6. create a user object - create entry in db
    // 7. remove password and refresh token field from response
    // 8. check if the user is created successfully
    // 9. return response
    
    // 1. get user details from frontend
    const {fullname, email, username, password} = req.body;
    
    // 2.validation of data: check if any of them is empty
    if([fullname, email, username, password].some((field) => field?.trim() === "")){
        throw new ApiError(400, "All fields are required");
    }

    // 3. check if the user already exists
    const userExists = await User.findOne({
        $or: [{ username }, { email }]
    });

    if(userExists){
        throw new ApiError(409, "User with the username or email already exists!");
    }

    // 4. check for images, check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required");
    }
    
    // 5. upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    console.log("Uploaded avatar to Cloudinary:", avatar);
    const coverImage = coverImageLocalPath ? await uploadOnCloudinary(coverImageLocalPath):null;


    if(!avatar || !avatar.url){
        throw new ApiError(500, "Failed to upload avatar to cloudinary");
    }

    // 6. create a user object - create entry in db
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    });

    // 7. remove password and refresh token field from response
    // manually check if the user exists using a db call
    // user._id : _id field is added to every record by mongodb automatically
    // "-password -refreshToken" using select(): using select all the fields will be selected, u just can unselect some fields using '-' infront of the fieldname
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    // 8. check if the user is created successfully
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering user");
    }

    // 9. return response
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    );
});

const loginUser = asyncHandler(async (req, res) => {
    // 1. grab email n password from req.body
    // 2. validation: check if both of them exits
    // 3. make db call to find if the user exits
    // 4. if user exits compare the password
    // 5. if the user is valid: generate access and refresh token
    // 6. send cookies and success message
    // 7. return response

    // 1. grab email n password from req.body
    const {email, username, password} = req.body;

    // 2. validation: check if both of them exits
    if(!(email || username)){
        throw new ApiError(400, "Username or email is required");
    }

    // 3. make db call to find if the user exits
    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User doesnt exist");
    }

    // 4. if user exits compare the password
    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials");
    }

    // 5. if the user is valid: generate access and refresh token
    const {accessToken, refreshToken} = await generateAccessTokenAndRefreshTokens(user._id);

    // optional: remove password n refreshtoken from the user instance
    const loggedInUser = await User.findOne(user._id).select("-password -refreshToken");

    // 6. secure the cookies so tht dont become modifiable from frontend
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
                .status(200)
                .cookie("accessToken", accessToken, options)
                .cookie("refreshToken", refreshToken, options)
                .json(new ApiResponse(
                    200,
                    {
                        user: loggedInUser, accessToken, refreshToken
                    },
                    "User logged in successfully"
                ));
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },    
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
            .status(200)
            .clearCookie("accessToken", options)
            .clearCookie("refreshToken", options)
            .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshToken = asyncHandler(async (req, res) =>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken; // for web(left of 'or') and mobile(right of 'or') devices

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorised request");
    }

    try {
        const decodedToken = await jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(user){
            throw new ApiError(401, "Invalid Refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessTokenAndRefreshTokens(user._id);
    
        return res
                .status(200)
                .cookie("accessToken", accessToken, options)
                .cookie("refreshToken", newRefreshToken, options)
                .json(
                    new ApiResponse(200, {accessToken, refreshToken: newRefreshToken}, "Access token refreshed")
                )
    } catch (error) {
        throw new ApiError(401, "Invalid refresh token");
    }
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshToken
};