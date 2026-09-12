require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./routes/auth");
const ordersRouter = require("./routes/orders");
const paymentRouter = require("./routes/payment");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "nusaeast-backend" }));

app.use("/api/auth", authRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/payment", paymentRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Nusa East backend jalan di http://localhost:${PORT}`);
});
