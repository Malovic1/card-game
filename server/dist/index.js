"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const rooms_1 = require("./rooms");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', game: 'treseta' });
});
const httpServer = http_1.default.createServer(app);
const io = (0, rooms_1.setupSocketIo)(httpServer);
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`Tréseta server listening on http://localhost:${PORT}`);
});
