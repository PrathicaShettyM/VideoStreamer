import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const tweetSchema = new Schema({
    content: {
        type: String,
        required: true,
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
}, {
    timestamps: true
})

tweetSchema.plugin(mongooseAggregatePaginate); // for mongodb aggregation
export const Tweet = mongoose.model('Comment', tweetSchema);