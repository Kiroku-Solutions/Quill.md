# Use the official Semgrep image
FROM semgrep/semgrep:latest

# Set the working directory where the app code will be mounted
WORKDIR /src

# Configure Semgrep to scan automatically using the default rules,
# and return the result in JSON format.
# If human-readable terminal output is desired, '--json' can be omitted.
USER semgrep
ENTRYPOINT ["semgrep", "scan", "--config", "p/default", "--json"]
