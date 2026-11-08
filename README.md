# herdr setup

My configuration for [herdr](https://herdr.dev), the terminal workspace manager for AI coding agents.

## What it sets

- **Theme:** Dracula (no automatic light/dark switching)
- **Notifications:** delivered as system notifications
- **Pane borders:** show agent labels
- **Agent panel:** sorted by spaces
- **Status indicators:** symbols
- Onboarding disabled

## Install

```sh
brew install herdr
git clone https://github.com/nevambla/nevambla-code.git
cd nevambla-code
./install.sh
```

`install.sh` backs up any existing `~/.config/herdr/config.toml`, copies this one in, validates it with `herdr config check` and reloads a running herdr server.

To install by hand instead, copy `config.toml` to `~/.config/herdr/config.toml` and run `herdr server reload-config`.

## Agent integrations

Integrations are not part of the config file. Install the ones you use, for example:

```sh
herdr integration install claude
```

Run `herdr integration status` to see them all.
