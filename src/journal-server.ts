import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
    ServerResponse
} from "node:http";

const eventClients: ServerResponse[] = [];

const JOURNAL_PORT = 3000;

export function startJournalServer(
    directory: string
): void {
    const server = createServer(async (request, response) => {
        if (request.url === "/events") {
            response.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            });

            eventClients.push(response);

            request.on("close", () => {
                const clientIndex = eventClients.indexOf(response);

                if (clientIndex !== -1) {
                    eventClients.splice(clientIndex, 1);
                }
            });

            return;
        }

        if (request.url === "/") {
            const journalPath = path.join(
                directory,
                "z-journal.html"
            );

            try {
                const html = await readFile(
                    journalPath,
                    "utf8"
                );

                response.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8",
                });

                response.end(html);
            } catch (error) {
                response.writeHead(500, {
                    "Content-Type": "text/plain; charset=utf-8",
                });

                response.end(
                    "Could not load the journal."
                );

                console.error(
                    "Could not serve journal:",
                    error
                );
            }

            return;
        }

        if (request.url === "/journal.js") {
            const journalScriptPath = path.resolve(
                "journal",
                "journal.js"
            );

            try {
                const javascript = await readFile(
                    journalScriptPath,
                    "utf8"
                );

                response.writeHead(200, {
                    "Content-Type": "text/javascript; charset=utf-8",
                });

                response.end(javascript);
            } catch (error) {
                response.writeHead(500, {
                    "Content-Type": "text/plain; charset=utf-8",
                });

                response.end(
                    "Could not load the journal script."
                );

                console.error(
                    "Could not serve journal script:",
                    error
                );
            }

            return;
        }

        if (request.url === "/journal.css") {
            const journalCssPath = path.resolve(
                "journal",
                "journal.css"
            );

            try {
                const css = await readFile(
                    journalCssPath,
                    "utf8"
                );

                response.writeHead(200, {
                    "Content-Type": "text/css; charset=utf-8",
                });

                response.end(css);
            } catch (error) {
                response.writeHead(500, {
                    "Content-Type": "text/plain; charset=utf-8",
                });

                response.end(
                    "Could not load the journal stylesheet."
                );

                console.error(
                    "Could not serve journal stylesheet:",
                    error
                );
            }

            return;
        }

        response.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8",
        });

        response.end("Not found.");
    });

    server.listen(JOURNAL_PORT, () => {
        console.log(
            `Journal available at http://localhost:${JOURNAL_PORT}`
        );
        console.log();
    });
}

export function notifyJournalUpdated(): void {
    for (const client of eventClients) {
        client.write("event: journal-updated\n");
        client.write("data: {}\n\n");
    }
}
