import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderNumber: { type: String, maxlength: 50 },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, match: /^[0-9]{10}$/ },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    status: { type: String, enum: ["Open", "In progress", "Closed"], default: "Open", index: true },
    replies: [{
      body: { type: String, required: true, maxlength: 3000 },
      author: { type: String, required: true, maxlength: 100 },
      internal: { type: Boolean, default: true },
      createdAt: { type: Date, required: true, default: Date.now },
    }],
  },
  { timestamps: true },
);

export default mongoose.model("SupportTicket", supportTicketSchema);
