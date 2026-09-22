import { pathToFileURL } from "node:url";

export async function checkAvailability(
  origin,
  request = fetch,
  includeBackups = false,
) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("An HTTPS origin without credentials is required");
  const results = [];
  const routes = [
    ["/api/health", 200],
    ["/login", 200],
    ["/recuperar-contrasena", 200],
    ["/actualizar-contrasena", 307],
  ];
  if (includeBackups) routes.push(["/api/backup-health", 200]);
  for (const [route, expected] of routes) {
    try {
      const response = await request(new URL(route, url), {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { "Cache-Control": "no-cache" },
      });
      let ok = response.status === expected;
      if (route === "/api/health" || route === "/api/backup-health") {
        const body = await response.text();
        ok =
          ok &&
          body.length < 1024 &&
          JSON.parse(body).status === "ok" &&
          (response.headers.get("cache-control") || "").includes("no-store");
      } else if (route === "/actualizar-contrasena") {
        const target = new URL(response.headers.get("location") || "/", url);
        ok = ok && target.origin === url.origin && target.pathname === "/login";
      } else {
        const body = await response.text();
        ok =
          ok &&
          body.includes(
            route === "/login" ? "Olvidé mi contraseña" : "Solicitar enlace",
          );
      }
      // Never emit returned HTML, errors, headers or private response bodies.
      results.push({ route, ok, status: response.status });
    } catch {
      results.push({ route, ok: false, status: null });
    }
  }
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkAvailability(
    process.env.SAAS_ORIGIN || "https://app.alldecorpatio.com",
    fetch,
    process.env.CHECK_BACKUPS === "true",
  )
    .then((results) => {
      for (const result of results) console.log(JSON.stringify(result));
      if (results.some((r) => !r.ok)) process.exitCode = 1;
    })
    .catch(() => {
      console.error("Invalid availability configuration");
      process.exitCode = 1;
    });
}
