import express from "express";
import dbConnect from "./db/dbConnect.js";
import dotenv from "dotenv";
dotenv.config();


const app = express();


// db connection promise
dbConnect()
.then(console.log("MongoDB connected successfully!!"))
.catch((err) => {
    console.log("Error connecting to the database");
});


app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
