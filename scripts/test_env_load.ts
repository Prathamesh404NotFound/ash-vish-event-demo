import dotenv from "dotenv";
dotenv.config();
console.log("PHONEPE_CLIENT_ID set:", !!process.env.PHONEPE_CLIENT_ID, process.env.PHONEPE_CLIENT_ID || "");
console.log("PHONEPE_CLIENT_SECRET set:", !!process.env.PHONEPE_CLIENT_SECRET);
