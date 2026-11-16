#!/usr/bin/env python3
"""Forward an exposed TCP port to local PostgreSQL without terminating TLS.

The database sees 127.0.0.1, not the original client. Enforce original-source
restrictions at the network boundary; PostgreSQL still authenticates clients.
"""
import argparse
import asyncio
import signal


async def relay(reader, writer, target_port):
    upstream = None
    tasks = []
    try:
        upstream_reader, upstream = await asyncio.wait_for(
            asyncio.open_connection('127.0.0.1', target_port), timeout=5)

        async def pump(source, destination):
            while data := await source.read(65536):
                destination.write(data)
                await destination.drain()

        tasks = [asyncio.create_task(pump(reader, upstream)),
                 asyncio.create_task(pump(upstream_reader, writer))]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except (OSError, asyncio.TimeoutError):
        pass
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        for stream in [writer, upstream]:
            if stream:
                stream.close()
        for stream in [writer, upstream]:
            if stream:
                try:
                    await stream.wait_closed()
                except OSError:
                    pass


async def main(args):
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    server = await asyncio.start_server(
        lambda r, w: relay(r, w, args.target_port), args.bind, args.port)
    async with server:
        print(f'PostgreSQL relay {args.bind}:{args.port} -> 127.0.0.1:{args.target_port}', flush=True)
        await stop.wait()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=1004)
    parser.add_argument('--target-port', type=int, default=5432)
    asyncio.run(main(parser.parse_args()))
