class Shape:
    sides = 0

    def __init__(self, name):
        self.name = name

    def describe(self):
        return "{} has {} sides".format(self.name, self.sides)

    @staticmethod
    def unit():
        return "mm"

    @property
    def label(self):
        return self.name.upper()


class Square(Shape):
    sides = 4

    def __init__(self, size_mm):
        super().__init__("square")
        self.size_mm = size_mm

    def area(self):
        return self.size_mm * self.size_mm


def make_counter(start=0, *args, **kwargs):
    state = [start]

    def step(amount=1):
        state[0] += amount
        return state[0]

    return step


counter = make_counter(10)
double = lambda x: x * 2  # noqa: E731
square = Square(30)
print(square.describe(), square.area(), Shape.unit(), square.label, counter(), double(21))
