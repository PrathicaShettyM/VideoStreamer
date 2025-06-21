import multer from "multer";

// file upload middleware using multer
const storage = multer.diskStorage({
    destination: function(req, file, cb){
        // cb: callback function
        cb(null, "../uploads")
    },
    filename: function (req, file, cb){
        cb(null, file.originalname)
    }
});

export const upload = multer({
    storage,
});