"""Validated YAML gateway settings with last-known-good, request-time reload."""
import logging
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StrictBool, field_validator, model_validator
import yaml

logger = logging.getLogger('uvicorn.error')
MAX_CONFIG_BYTES = 65536


class UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        mapping = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, str):
                raise ValueError('YAML keys must be strings')
            if key in mapping:
                raise ValueError(f'Duplicate YAML key: {key}')
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


class GatewayRoute(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    prefix: str = Field(pattern=r'^/[a-z][a-z0-9-]*$', max_length=65)
    upstream: HttpUrl
    enabled: StrictBool = True
    require_login: StrictBool = False
    redirect_hosts: list[str] = Field(default_factory=list)
    read_timeout_seconds: int = Field(default=660, strict=True, ge=1, le=3600)

    @field_validator('prefix')
    @classmethod
    def available_prefix(cls, value):
        if value in {'/api', '/assets'}:
            raise ValueError('This prefix is reserved by the portal')
        return value

    @field_validator('upstream')
    @classmethod
    def origin_only(cls, value):
        if value.username or value.password or value.query is not None or value.fragment is not None or value.path not in {None, '/'}:
            raise ValueError('Upstream must be an HTTP(S) origin without path, query or credentials')
        return value

    @field_validator('redirect_hosts')
    @classmethod
    def hosts_only(cls, values):
        for value in values:
            url = urlsplit('https://' + value)
            if not url.hostname or url.netloc != value or url.username or url.password or url.path or url.query or url.fragment:
                raise ValueError('Redirect hosts must contain host[:port] only')
            _ = url.port  # Also reject invalid port syntax.
        return values


class GatewaySettings(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: Literal[1]
    gateways: list[GatewayRoute]

    @model_validator(mode='after')
    def unique_prefixes(self):
        if len({route.prefix for route in self.gateways}) != len(self.gateways):
            raise ValueError('Gateway prefixes must be unique')
        return self


def load_gateway_config(path: Path) -> GatewaySettings:
    with path.open('rb') as source:
        contents = source.read(MAX_CONFIG_BYTES + 1)
    if len(contents) > MAX_CONFIG_BYTES:
        raise ValueError('Gateway configuration exceeds 64 KiB')
    return GatewaySettings.model_validate(yaml.load(contents, Loader=UniqueKeyLoader))


class GatewayConfig:
    def __init__(self, path: Path):
        self.path = path
        self.routes: tuple[GatewayRoute, ...] = ()
        self.signature = None
        self.valid = False
        self.refresh(initial=True)

    def refresh(self, initial=False):
        try:
            stat = self.path.stat()
            signature = (stat.st_ino, stat.st_mtime_ns, stat.st_size)
        except OSError:
            signature = ('unavailable',)
        if signature == self.signature:
            return
        try:
            settings = load_gateway_config(self.path)
        except (OSError, ValueError, yaml.YAMLError) as exc:
            if initial:
                raise
            self.signature = signature
            self.valid = False
            # Do not include raw configuration values (e.g. mistyped credentials) in logs.
            logger.error('Gateway config rejected (%s); keeping last valid routes. Check config/config.yaml.', type(exc).__name__)
            return
        self.routes = tuple(route for route in settings.gateways if route.enabled)
        self.signature = signature
        self.valid = True
        logger.info('Gateway configuration applied: %d active routes', len(self.routes))

    def match(self, path):
        self.refresh()
        return next((route for route in self.routes if path == route.prefix or path.startswith(route.prefix + '/')), None)

    def status(self):
        self.refresh()
        return {'status': 'ok' if self.valid else 'last_known_good', 'active_routes': len(self.routes)}
