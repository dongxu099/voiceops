"""Local developer commands; stdout never contains credentials or bearer capabilities."""

from pathlib import Path

import typer
import uvicorn

from voiceops.cloud import provision as provision_resources
from voiceops.provider import ElevenAgents, ProviderError, load_keychain, read_cloud, write_cloud
from voiceops.server import create_app

app = typer.Typer(no_args_is_help=True)


def client(keychain: bool) -> ElevenAgents:
    if keychain:
        load_keychain()
    return ElevenAgents()


@app.command()
def doctor(keychain: bool = False, data_dir: Path = Path("data")):
    """Read-only key/Agents preflight. Missing permissions are not an invalid key."""
    provider = client(keychain)
    try:
        provider.request("GET", "/v1/convai/agents", params={"page_size": 1})
    except ProviderError as error:
        state = read_cloud(data_dir)
        state["status"] = error.status if error.status == "missing_permissions" else "not_configured"
        write_cloud(data_dir, state)
        typer.echo(f"Agents preflight: {error.status}; HTTP {error.http_status or 'unavailable'}.")
        if error.status == "missing_permissions":
            typer.echo("Enable ElevenAgents and Knowledge Base read/write permissions for this server key.")
        raise typer.Exit(1) from None
    state = read_cloud(data_dir)
    state["status"] = "ready" if state.get("agent_id") else "not_configured"
    write_cloud(data_dir, state)
    typer.echo("Agents read permission: available. Provisioning also requires write and Knowledge Base access.")


@app.command()
def provision(keychain: bool = False, data_dir: Path = Path("data"),
              voice_id: str = "JBFqnCBsd6RMkjVDRZzb"):
    """Create private demo agent, four client tools and synthetic support knowledge."""
    try:
        state = provision_resources(client(keychain), data_dir, voice_id)
    except ProviderError as error:
        typer.echo(f"Provisioning stopped: {error.status}; HTTP {error.http_status or 'unavailable'}.")
        typer.echo("Partial resource IDs are retained locally. Repair access before retrying.")
        raise typer.Exit(1) from None
    typer.echo(f"Demo agent ready. {len(state['tool_ids'])} client tools; synthetic policy attached.")
    typer.echo("IDs remain in ignored local state. Start voiceops serve --keychain and use Live text or Voice.")


@app.command()
def serve(keychain: bool = False, data_dir: Path = Path("data"), port: int = 7861):
    """Serve the app on loopback only; live conversations start from an explicit UI click."""
    provider = client(keychain)
    uvicorn.run(create_app(data_dir, provider), host="127.0.0.1", port=port, log_level="warning")
