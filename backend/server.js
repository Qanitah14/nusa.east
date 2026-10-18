require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./routes/auth");
const ordersRouter = require("./routes/orders");
const paymentRouter = require("./routes/payment");
const catalogRouter = require("./routes/catalog");
const pagesRouter = require("./routes/pages");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "nusaeast-backend" }));

app.use("/api/auth", authRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/pages", pagesRouter);

// File upload (gambar produk & halaman) bisa diakses di http://localhost:4000/uploads/...
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Nusa East backend jalan di http://localhost:${PORT}`);
});
