from pybricks.hubs import PrimeHub
from pybricks.parameters import Port, Color
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor
from pybricks.tools import wait, StopWatch

# --- Config ---------------------------------------------------------------
LEFT_MOTOR_PORT = Port.A
RIGHT_MOTOR_PORT = Port.B
COLOR_PORT = Port.C
DISTANCE_PORT = Port.D
SPEED_DEG_S = 360
STOP_DISTANCE_MM = 100

# --- Setup ----------------------------------------------------------------
hub = PrimeHub()
left = Motor(LEFT_MOTOR_PORT)
right = Motor(RIGHT_MOTOR_PORT)
color = ColorSensor(COLOR_PORT)
distance = UltrasonicSensor(DISTANCE_PORT)
watch = StopWatch()

# --- Main -----------------------------------------------------------------
try:
    while True:
        try:
            gap = distance.distance()
        except OSError:
            gap = None
        if gap is not None and gap < STOP_DISTANCE_MM:
            hub.light.on(Color.RED)
            left.stop()
            right.stop()
        else:
            left.run(SPEED_DEG_S)
            right.run(SPEED_DEG_S)
        print(watch.time(), left.angle(), gap, color.reflection())
        wait(50)
finally:
    left.stop()
    right.stop()
