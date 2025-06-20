import express from "express";
import dbConnect from "./db/dbConnect.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
dotenv.config();

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
})); // .use() => used with middlewares or configurations

app.use(express.json({
    limit: "16kb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "16kb"
}));

app.use(express.static("public"));

app.use(cookieParser());


// db connection promise
dbConnect()
.then(console.log("MongoDB connected successfully!!"))
.catch((err) => {
    console.log("Error connecting to the database");
});


app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
