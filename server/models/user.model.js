import mongoose, {Schema} from "mongoose";
import jwt from 'jsonwebtoken';
import bcrypt from "bcryptjs";

const userSchema = new Schema({
    username :{
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true, // optimises the search operation
    }, 
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    }, 
    fullname: {
        type: String,
        required: true,
        trim: true,
        index: true, // optimises the search operation
    },
    avatar: {
        type: String, // cloudinary url
        required: true,
    },
    coverImage: {
        type: String, // cloudinary url
    },
    watchHistory: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Video",
        }
    ],
    password: {
        type: String,
        required: [true, "Password is required"]
    },
    refreshToken: {
        type: String,
    } 
}, {
    timestamps: true
});

// middleware pre hook: use normal function(not arrow functions) bcoz it needs to know the context (coz we use 'this' keyword)
// hash(encrypt) the password before saving it to the database
userSchema.pre("save", async function(next){
    if(!this.isModified("password")) return next();

    this.password = await bcrypt.hash(this.password, 10)
    next()
});

// compare the plaintext password with the hased password
userSchema.methods.isPasswordCorrect = async function(password){
    return await bcrypt.compare(password, this.password);
}

// access token
userSchema.methods.generateAccessToken = function () {
    return jwt.sign({
        _id: this._id,
        email: this.email,
        username: this.username,
        fullname: this.fullname,
    }),
    process.env.ACCESS_TOKEN_SECRET,
    {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY
    }
}

// refresh token
userSchema.methods.generateRefreshToken = function () {
    return jwt.sign({
        _id: this._id,
    }),
    process.env.REFRESH_TOKEN_SECRET,
    {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY
    }
}

export const User = mongoose.model("User", userSchema);
// jwt: bearer token
