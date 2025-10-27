import { test } from "tap";
import { buildApp } from "./server.js";

test("GET / returns ok: true", async (t) => {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/",
  });

  t.equal(response.statusCode, 200);
  t.same(response.json(), { ok: true });

  await app.close();
});

test("GET / returns JSON content type", async (t) => {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/",
  });

  t.equal(response.statusCode, 200);
  t.match(response.headers["content-type"], /application\/json/);

  await app.close();
});
