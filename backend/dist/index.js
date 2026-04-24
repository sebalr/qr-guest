"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = __importDefault(require("./routes/auth"));
const events_1 = __importDefault(require("./routes/events"));
const tickets_1 = __importDefault(require("./routes/tickets"));
const scans_1 = __importDefault(require("./routes/scans"));
const sync_1 = __importDefault(require("./routes/sync"));
const admin_1 = __importDefault(require("./routes/admin"));
const stats_1 = __importDefault(require("./routes/stats"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/auth', auth_1.default);
app.use('/events', events_1.default);
app.use('/', tickets_1.default);
app.use('/scan', scans_1.default);
app.use('/sync', sync_1.default);
app.use('/admin', admin_1.default);
app.use('/events', stats_1.default);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// Global error handler
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map