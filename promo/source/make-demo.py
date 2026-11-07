# Makes demo.csv: six weeks of made-up nights for the screenshots and videos (nothing from a real
# journal). Someone doing CBT-I whose sleep slowly gets better: later nights are longer and calmer.
# The same every time (fixed seed). Import it in Settings → Import, in a fresh browser profile.
import csv, random
from datetime import date, timedelta

random.seed(7)
FIRST, LAST = date(2026, 9, 24), date(2026, 11, 5)  # the shots happen on Nov 6 and 7

def clock(minutes):  # minutes after midnight (may be negative or over 24 h) → "11:40 PM"
    minutes %= 24 * 60
    h, m = divmod(minutes, 60)
    return f'{(h % 12) or 12}:{m:02d} {"AM" if h < 12 else "PM"}'

BEDTIME_NOTES = ['Read for half an hour.', 'Tea, then bed.', 'Long day at work.', 'Stretched for 10 minutes.',
                 'Wound down with music.', 'Couldn’t stop thinking about tomorrow.', 'Warm shower first.',
                 'Wrote tomorrow’s to-do list.', '', '', '', '']
MORNING_NOTES = ['Felt foggy until lunch.', 'Up before the alarm.', 'Slow start.', 'Good energy all morning.',
                 'Needed two coffees.', 'Woke once, fell back asleep quickly.', '', '', '', '']
DREAMS = [
    'I was on a train that kept getting longer. Every car had a different season inside.',
    'My old school had a library in the basement I never knew about. The books were all blank, and warm.',
    'I could breathe underwater, but only while humming.',
    'A fox walked me home and asked about my week.',
    'The ocean was made of soft blue fabric. We walked across it to an island of lamps.',
    'I was late for a test in a subject that doesn’t exist.',
    'My grandmother’s kitchen, but every drawer opened onto the sky.',
    'I found a door in my closet that led to a quiet greenhouse full of moths.',
    'Flying, low over the roofs, a little too slowly.',
    'A city where the streetlights hummed different notes.',
]
TAGS_BAD = ['caffeine', 'late screens', 'stress', 'woke up at night', 'insomnia']
TAGS_GOOD = ['exercise', 'good dream']

header = ['Night of', 'Day', 'Hours asleep', 'In bed', 'Tried to sleep', 'Bedtime note', 'Minutes to fall asleep',
          'Woke up', 'Started day', 'Rested (1-5)', 'Tags', 'Morning note', 'Dream',
          'Bedtime: Brush teeth', 'Bedtime: Take meds / vitamins', 'Bedtime: Phone / devices off',
          'Bedtime: Phone on charger (away from bed)', 'Morning: Brush teeth', 'Morning: Take meds / vitamins',
          'Morning: Drink water', 'Morning: Get some sunlight', 'Morning: Times woke in the night',
          'Morning: Minutes awake in the night', 'Anytime: Exercise']
rows = []
n = (LAST - FIRST).days + 1
for i in range(n):
    night = FIRST + timedelta(days=i)
    k = i / (n - 1)  # 0 at the start, 1 at the end: things get better
    weekend = night.weekday() in (4, 5)
    tried = 23 * 60 + 10 + random.randint(-20, 25) + (35 if weekend else 0) + int(55 * (1 - k))  # earlier nights over time
    in_bed = tried - random.choice([0, 5, 10, 15, 20])
    latency = max(5, int(random.gauss(45 - 30 * k, 10)))
    wakes = max(0, round(random.gauss(2.6 - 2 * k, 0.8)))
    awake = 0 if wakes == 0 else max(5, int(random.gauss(wakes * (14 - 7 * k), 6)))
    woke = 6 * 60 + 50 + random.randint(-15, 20) + (50 if night.weekday() in (5, 6) else 0) - int(25 * (1 - k))
    started = woke + random.choice([5, 10, 15, 20, 30])
    rested = min(5, max(1, round(random.gauss(2.3 + 2.2 * k, 0.6))))
    tags = []
    if random.random() < 0.45 - 0.3 * k: tags.append(random.choice(TAGS_BAD))
    if wakes >= 3: tags.append('woke up at night')
    exercised = random.random() < 0.3 + 0.35 * k
    if exercised: tags.append('exercise')
    dream = DREAMS[i % len(DREAMS)] if random.random() < 0.3 else ''
    if dream and random.random() < 0.5: tags.append('good dream')
    tags = list(dict.fromkeys(tags))
    phone_off = tried - random.choice([15, 30, 45, 60]) if k > 0.3 or random.random() < 0.4 else None
    full = True
    rows.append([
        night.isoformat(), '', '', clock(in_bed), clock(tried), random.choice(BEDTIME_NOTES),
        latency if full else '', clock(woke) if full else '', clock(started) if full else '',
        rested if full else '', ' + '.join(tags) if full else '', random.choice(MORNING_NOTES) if full else '',
        dream if full else '',
        'yes', 'yes' if random.random() < 0.85 else '', clock(phone_off) if phone_off is not None else '',
        'yes' if random.random() < 0.3 + 0.6 * k else '',
        'yes' if full else '', 'yes' if full and random.random() < 0.85 else '',
        'yes' if full and random.random() < 0.8 else '', 'yes' if full and random.random() < 0.3 + 0.5 * k else '',
        wakes if full else '', awake if full and wakes else (0 if full else ''),
        'yes' if exercised else '',
    ])
with open('demo.csv', 'w', newline='', encoding='utf-8') as f:
    csv.writer(f).writerows([header] + rows)
print(len(rows), 'nights')
