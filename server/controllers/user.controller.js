import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

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

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user._id); // req.user._id: possible for a logged in user

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false});

    return res.status(200).json(
        new ApiResponse(200, {}, "Password changed successfully")
    )
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
            .status(200)
            .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});
// tip: if u want to update files: make a separate endpoint, dont use them with the text data update to improve performance

const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullname, email} = req.body;

    if(!fullname || !email){
        throw new ApiError(400, "Both fullname and email are required");
    }

    const user = User.findByIdAndUpdate(
        req.user?._id,{
            $set: {
                fullname,
                email
            }
        },
        { 
            new: true
        }
    ).select("-password")

    return res
                .status(200)
                .json(new ApiResponse(200, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing");
    }

    // hw: delete old image 

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if(!avatar.url){
        throw new ApiError(400, "Error while uploading Avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password");

    return res.status(200).json(new ApiResponse(200, user, "Updated Avatar successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover Image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading Cover Image");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password");

    return res.status(200).json(new ApiResponse(200, user, "Updated Cover Image successfully"));
});

const getUserChannelProfile = asyncHandler(async(req, res) => {
    // when we try to get channel profile, we'll go to the url => use req.params
    const {username} = req.params;
    if(!username){
        throw new ApiError(400, "Username is missing");
    }

    // here u can do directly User.find({username}) but again u need to find values based on id, which adds overhead to this, so go with aggregation pipelines
    const channel = await User.aggregate([
        {
            $match: { // this is similar to 'where' clause in sql
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: { // this is similar to 'from' clause in sql 
                from: "subscriptions", // from which table (here which document)
                localField: "_id", // primary key
                foreignField: "channel", // foreign key
                as: "subscribers" // as: give the field a new name
            }
        },
        {
            $lookup: {
                from: "subscriptions", // from which table (here which document)
                localField: "_id", // primary key
                foreignField: "subscriber", // foreign key
                as: "subscribedTo" // as: give the field a new name
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: { // check if the current user is subscribed to a channel or not
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullname: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    console.log(channel);

    if(!channel?.length){
        throw new ApiError(404, "Channel doesnt exist");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, channel[0], "User channel fetched successfully"))
})
// Write articles on this

// interview question: object id datatype in mongodb: string type -> can be converted to number type using mongoose

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {   // where
            $match: { // in aggregation pipeline we cant use req.user._id directly coz it deals directly with the db n not with the mongoose layer
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {   // from
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {   // select
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {   // show only these fields
                                    $project: { // similar to select field
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                       $addFields: { // make it easy for frontend integration
                        owner: {
                            $first: "$owner", // or "arryEleAt" option
                           }
                       } 
                    }
                ]
            }
        }
    ])

    return res.status(200).json(new ApiResponse(200, user[0].watchHistory, "Watch history fetched successfully"))
})




export {
    registerUser,
    loginUser,
    logoutUser,
    refreshToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
};