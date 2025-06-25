import mongoose from "mongoose";

const dbConnect = async () => {
    try {
        const connectionInstance = await mongoose.connect(process.env.MONGO_URI_CLOUD);
        console.log("DB Host: " +connectionInstance.connection.host);
    } catch (error) {
        console.log("DB connection Failure Reason: " + error);
        process.exit(1);
    }
}

export default dbConnect;