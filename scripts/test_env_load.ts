import dotenv from "dotenv";
dotenv.config();
console.log("KEY_ID set:", !!process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_ID || "");
console.log("KEY_SECRET set:", !!process.env.RAZORPAY_KEY_SECRET);
