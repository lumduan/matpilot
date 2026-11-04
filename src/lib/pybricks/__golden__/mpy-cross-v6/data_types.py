big = 2 ** 100
small = -123456
ratio = 3.14159
ratio_e = 1e-3
raw = b"\x00\x01\xff"
text = "Thai: สวัสดีครับ, emoji: ❤"
items = [1, 2.5, "three", (4, 5), {6}, None, True, False]
table = {"speed_mm_s": 200, "distance_mm": 1000.0}
name = "MatPilot"
message = f"{name} drives {table['distance_mm']:.1f} mm at {table['speed_mm_s']} mm/s"
print(big, small, ratio, ratio_e, raw, text, items, message)
print(text.upper(), message.split(" "), sorted([3, 1, 2]), max(items[:2]))
