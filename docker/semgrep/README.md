# Cybersecurity Scanner (Semgrep)

This directory contains the Docker configuration to run **Semgrep**, a Static Application Security Testing (SAST) tool. Semgrep inspects the source code (TypeScript, JavaScript, Svelte, etc.) looking for vulnerabilities and security bad practices.

We use Docker to isolate the execution environment. This ensures that anyone on the team or any AI Agent can run the scanner without issues, regardless of whether they use Windows, macOS, or Linux, and without relying on conflicting local Python/pip installations.

## Prerequisites

- Have [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine) installed and **running** on your system.

## How to use this scanner?

You have two options to run the analysis:

### Option 1: Quick and Direct Execution (Recommended)

You do not need to build the Dockerfile. Simply open your terminal in the **root of your project** and run:

**To view the results in the terminal (human-readable mode):**

```powershell
docker run --rm -v "${PWD}:/src" semgrep/semgrep semgrep scan --config p/default
```

**To extract the results to a JSON file (ideal for AI Agents):**

```powershell
docker run --rm -v "${PWD}:/src" semgrep/semgrep semgrep scan --config p/default --json | Out-File -Encoding utf8 semgrep_results.json
```

### Option 2: Using the local Dockerfile (Customized mode)

If you need to add custom rules in the future or modify the base behavior, you can build and run the image from this folder.

1. Open the terminal and navigate to this folder (`docker/semgrep`):
   ```powershell
   cd docker/semgrep
   ```
2. Build the local Docker image:
   ```powershell
   docker build -t my-local-semgrep .
   ```
3. Return to the root of the project and run the image pointing to the code:
   ```powershell
   cd ..\..\
   docker run --rm -v "${PWD}:/src" my-local-semgrep > semgrep_results.json
   ```

---

> **Note for the AI Agent:**
> When Docker Desktop is active, you can invoke the commands from Option 1 via PowerShell to diagnose the application's security status.
