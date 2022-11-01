# matchmaker

This script runs a webserver that will serve the rotating byte (AHK), game source, and endpoints for hashing matchmaking tokens.

## Unix permissions

Assuming `game` is your desired user:

```sh
$ chmod 760 ./bin/ -R
$ chown game ./bin/ -R
```
