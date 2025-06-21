import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
    // 1. get user details from frontend
    // 2. validation of data: check if any of them is empty
    // 3. check if the user already exists
    // 4. check for images, check for avatar
    // 5. upload them to cloudinary, avatar
    // 6. create a user object - create entry in db
    // 7. remove password and refresh token field from response
    // 8. check if the user is created successfully
    // 9. return res
    
    // 1.
    const {fullname, email, username, password} = req.body;
    
    // 2.
    if([fullname, email, username, password].some((field) => field?.trim() === "")){
        throw new ApiError(400, "All fields are required");
    }

    // 3.
    const userExists = User.findOne({
        $or: [{ username }, { email }]
    });

    if(userExists){
        throw new ApiError(409, "User with the username or email already exists!");
    }

    // 4.
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required");
    }
    
    // 5.
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400, "Avatar file is required");
    }

    // 6.
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    });

    // 7.
    // manually check if the user exists using a db call
    // user._id : _id field is added to every record by mongodb automatically
    // "-password -refreshToken" using select(): using select all the fields will be selected, u just can unselect some fields using '-' infront of the fieldname
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    // 8.
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering user");
    }

    // 9.
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    );
});

export {
    registerUser
};