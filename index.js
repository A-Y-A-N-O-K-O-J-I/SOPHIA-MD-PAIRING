const express = require("express");
const cors = require("cors");
const path = require("path");
const { generateQR } = require("./qr");
const pairRouter = require("./pair");
const validate = require("./valid");
const { generateQR2 } = require("./term-qr");
const termPairRouter = require("./term-pair");
require("dotenv").config();
require("module-alias/register");

const app = express();

app.use(
  cors({
    origin: ["https://sophia-md-pair.vercel.app", "http://localhost:3000"],
    methods: ["GET"],
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json());
app.use(express.static("public"));

app.get("/qr", generateQR);
app.use("/pair", pairRouter);
app.use("/valid", validate);
app.use("/term-pair", termPairRouter);
app.use("/term-qr", generateQR2);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Pairing server running on port ${PORT}`);
});
