# Kết quả spike Gemini

Trạng thái: **chưa chạy** — cần `GOOGLE_GENERATIVE_AI_API_KEY` trong `.env`, rồi `npm run spike`.

Đã xác định từ type của SDK đã cài (chưa kiểm chứng với API thật):

| Mục | Giá trị |
|---|---|
| Phiên bản `ai` | 7.0.159 (`@ai-sdk/google` 4.0.109) |
| Trường cached tokens | `usage.inputTokenDetails.cacheReadTokens` |
| Ghi đè system ở lượt cuối | `prepareStep` trả `{ toolChoice: 'none', instructions }` (`system` đã deprecated) |

Cần ghi lại sau khi chạy:
- Câu 2 có `cacheReadTokens` > 0 trên free tier không?
- Lượt cuối có `finishReason` khác `tool-calls` không?
