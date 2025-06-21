import {v2 as cloudinary} from "cloudinary";
const fs = require("fs");

// cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// file upload on cloudinary
const uploadOnCloudinary = async (localFilePath) => {
    try {
        // check if the file path exists
        if(!localFilePath){
            return null;
        }

        // upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        });

        console.log("File uploaded successfully on cloudinary!!", response.url);
        return response;
    } catch (error) {
        // remove the locally saved temporary file as the upload operation failed above in the 'try' part
        fs.unlinkSync(localFilePath);
        return null;
    }
}


export {uploadOnCloudinary};






