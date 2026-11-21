function readBody(request, limit = 512 * 1024) {
    return new Promise((resolve, reject) => {
        let chunks = [];
        let size = 0;
        request.on("error", reject);
        request.on("data", (chunk) => {
            if (chunks === null) return;
            size += chunk.length;
            if (size > limit) {
                chunks = null;
                reject(Object.assign(new Error("Request body too large"), { status: 413 }));
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            if (chunks) resolve(Buffer.concat(chunks).toString("utf8"));
        });
    });
}

function json(response, code, data) {
    response.writeHead(code, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
}

module.exports = { readBody, json };
