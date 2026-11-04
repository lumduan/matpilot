from pybricks.tools import multitask, run_task, wait


async def blink(times):
    for _ in range(times):
        await wait(100)
    return times


async def report():
    await wait(50)
    print("report")


async def main():
    result = await multitask(blink(3), report())
    print(result)


run_task(main())
