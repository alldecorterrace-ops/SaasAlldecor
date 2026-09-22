import { assertDeploymentEnvironment } from "./lib/deployment-environment";
export function register() {
  assertDeploymentEnvironment(process.env);
}
