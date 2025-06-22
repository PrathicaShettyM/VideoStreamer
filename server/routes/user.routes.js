import {Router} from "express";
import { loginUser, logoutUser, registerUser, refreshToken } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js"; 
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// public routes
router.route("/register").post(
    // upload.files(): this is a middleware
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser
);
router.route("/login").post(loginUser)

// private routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-token").post(refreshToken);

export default router;