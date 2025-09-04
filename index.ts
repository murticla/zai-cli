import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
      baseUrl: "http://localhost:3001",
      responseStyle: "data",
})