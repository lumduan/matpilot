def classify(n):
    if n < 0:
        return "negative"
    elif n == 0:
        return "zero"
    return "positive"


total = 0
for i in range(10):
    if i % 3 == 0:
        continue
    total += i
    if total > 30:
        break

count = 0
while count < 5:
    count += 1

squares = [x * x for x in range(6) if x % 2]
pairs = {k: v for k, v in zip("abc", range(3))}

try:
    value = 1 / 0
except ZeroDivisionError as error:
    value = None
finally:
    print("done", total, count, squares, pairs, value, classify(-2))
