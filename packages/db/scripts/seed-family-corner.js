const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const items = [
  // RECIPES
  {
    category: "RECIPES",
    title: "Quick & Nutritious School Lunch Box Ideas",
    body: "Mornings are busy, but a good lunch box doesn't need to take long. Try this simple formula: one protein (boiled egg, roasted chicken strips, or beans), one whole grain (brown rice, whole wheat bread, or boiled yam), one fruit or vegetable (orange slices, cucumber sticks, or carrot sticks), and one small treat (a few nuts or a homemade oat cookie).\n\nPrep tip: boil eggs and chop vegetables the night before and store them in the fridge — assembling the lunch box in the morning then takes under five minutes. Rotating between 4-5 combinations weekly keeps things interesting without adding extra mental load.\n\nAvoid packing anything that needs to stay very cold or very hot unless you have an insulated box, and always include a small bottle of water.",
  },
  {
    category: "RECIPES",
    title: "5-Minute Healthy Breakfast for Busy Mornings",
    body: "A rushed morning doesn't mean your child has to skip breakfast. Overnight oats are one of the easiest options: the night before, mix half a cup of oats with milk (or yoghurt), a spoon of honey, and a handful of chopped fruit in a cup with a lid. By morning it's ready to eat, cold or warmed up.\n\nAnother fast option is a banana-and-groundnut smoothie: blend one ripe banana, a cup of milk, a spoon of groundnut paste (peanut butter), and a few ice cubes. It takes two minutes and gives a good mix of energy, protein and fibre to start the school day.\n\nEven on the busiest mornings, try to avoid sending children to school on an empty stomach — it affects concentration in the first few lessons.",
  },
  {
    category: "RECIPES",
    title: "Fun Snacks Kids Can Help Make",
    body: "Getting children involved in the kitchen (safely) builds confidence and makes them more likely to actually eat what they help prepare. A great starter recipe is fruit kebabs: let your child thread chunks of banana, watermelon, pineapple and grapes onto a wooden skewer (with supervision) for a colourful, no-cook snack.\n\nAnother favourite is 'ants on a log' — celery sticks spread with peanut butter and topped with raisins. It's simple enough for a 5-year-old to assemble and is genuinely nutritious.\n\nFor an occasional weekend treat, try no-bake energy balls: mix rolled oats, peanut butter, a little honey and a handful of chocolate chips, then roll into small balls and chill for 20 minutes. Great for lunch boxes too.",
  },
  // PARENTING_TIPS
  {
    category: "PARENTING_TIPS",
    title: "Helping Your Child Build a Study Routine",
    body: "Children thrive on predictability. Rather than telling your child to 'go and read', try setting a consistent daily study window — for example, 5:00–5:45pm, right after playtime and before dinner. The exact time matters less than the consistency.\n\nBreak the session into short chunks: 20 minutes of focused work, a 5-minute break, then another 15-20 minutes. Younger children especially struggle to concentrate for long, unbroken stretches.\n\nKeep the study space simple — a clear table, good lighting, and no television or phone nearby. Sit with younger children occasionally to show interest, but resist doing the work for them; the goal is building their own habit, not producing perfect homework every night.\n\nCelebrate consistency, not just results — praising 'you sat down and did your reading every day this week' builds the routine itself.",
  },
  {
    category: "PARENTING_TIPS",
    title: "Talking to Your Child About Their School Day",
    body: "\"How was school?\" often gets a one-word answer: \"Fine.\" Try more specific questions instead — \"What made you laugh today?\", \"Who did you sit with at lunch?\", or \"What was the hardest part of your day?\" These open up conversation far more than a general question.\n\nTiming matters too. Right after pickup, many children are tired and not ready to talk — a car ride, a snack, or some quiet time first often works better than diving straight into questions.\n\nWhen your child does share something difficult (a disagreement with a friend, a tough test), resist jumping straight to solving it. Often they just need to feel heard first. A simple \"that sounds frustrating, tell me more\" goes a long way before offering advice.",
  },
  {
    category: "PARENTING_TIPS",
    title: "Setting Healthy Screen Time Boundaries",
    body: "Rather than a single blanket rule, it helps to separate screen time into categories: schoolwork (usually unrestricted), educational content, and entertainment/games. Being clear about which category an activity falls into avoids constant negotiation.\n\nA practical approach for school-age children is: screens off during homework time and at least 30-60 minutes before bed, with a set daily limit for entertainment use (many families find 1-2 hours on school days works well, more flexibility on weekends).\n\nModel the behaviour you want to see — children notice when household screen rules only apply to them. Where possible, make some screen time social rather than solitary (watching something together, playing a game as a family) rather than treating all screen use the same way.",
  },
  // CHILD_HEALTH
  {
    category: "CHILD_HEALTH",
    title: "Signs Your Child Needs More Sleep",
    body: "Primary school children generally need 9-11 hours of sleep a night, and teenagers need 8-10 — more than many get. Watch for signs of sleep debt: difficulty waking up in the morning, irritability or mood swings in the afternoon, falling asleep in the car or during quiet activities, and declining concentration at homework time.\n\nA consistent bedtime, even on weekends, is one of the most effective fixes. Try winding down 30-45 minutes before lights out with a calm activity — reading, quiet conversation — rather than screens, which can delay the body's natural sleepiness.\n\nIf your child is getting what seems like enough sleep hours but still seems constantly tired, it's worth mentioning to your doctor — occasionally this points to something worth checking, like an iron deficiency.",
  },
  {
    category: "CHILD_HEALTH",
    title: "Keeping Kids Hydrated and Active",
    body: "Children are more prone to dehydration than adults because they don't always recognise or say when they're thirsty, especially during play or sport. A simple habit is to send a refillable water bottle to school every day and encourage a drink at every break, not just when thirsty.\n\nOn hydration and activity: children need at least 60 minutes of physical activity a day, and it doesn't need to be formal exercise — active play, walking to school, or a family game in the yard all count. If screen time is high and outdoor play is low, look for small swaps rather than a dramatic overhaul: a 15-minute walk after dinner, or 20 minutes in the yard before homework.\n\nSigns of mild dehydration to watch for include headaches, dry lips, and low energy — a glass of water is often the simplest fix worth trying first.",
  },
  {
    category: "CHILD_HEALTH",
    title: "When to Keep a Sick Child Home from School",
    body: "It's not always an easy call, but a few clear guidelines help. Keep your child home if they have a fever (generally above 38°C), have vomited or had diarrhoea in the last 24 hours, or have a contagious condition like conjunctivitis (pink eye) or an undiagnosed rash.\n\nA mild cold with no fever, where your child is eating and playing normally, is usually fine for school — most children have several colds a year and can't reasonably stay home for each one.\n\nWhatever the decision, please inform the school office of the reason for absence, and if a doctor advises a specific return date (common with conditions like chickenpox or conjunctivitis), let the school know so records can be kept accurately.",
  },
  // STUDY_SUPPORT
  {
    category: "STUDY_SUPPORT",
    title: "How to Help with Homework Without Doing It For Them",
    body: "It's tempting to just give the answer when a child is stuck, especially under time pressure — but the more useful habit is asking questions that help them find it themselves. Try: \"What do you think the first step is?\", \"Is there an example in your notes that looks similar?\", or \"What part exactly is confusing you?\"\n\nIf they're truly stuck after a genuine attempt, it's fine to work through one similar example together, then have them try the actual question alone. This builds the skill rather than just completing the task.\n\nIf you notice your child is consistently unable to do work without heavy help across several subjects, that's useful information to share with their teacher — it may point to a gap worth addressing in class rather than something to solve entirely at home.",
  },
  {
    category: "STUDY_SUPPORT",
    title: "Simple Memory Tricks for Exam Revision",
    body: "Re-reading notes feels productive but is one of the least effective ways to remember material. Active recall works far better: after reading a section, close the book and try to write down or say out loud everything remembered, then check what was missed.\n\nSpacing revision out over several days (instead of one long session the night before) also dramatically improves retention — this is sometimes called 'spaced repetition'. A simple version: revise a topic today, briefly again in 2 days, then again in a week.\n\nFor lists or sequences, acronyms and mnemonics genuinely help (for example, using the first letter of each item to build a memorable phrase). And explaining a topic out loud to someone else — even a younger sibling or a parent who knows nothing about it — is one of the fastest ways to find out what's actually understood versus just familiar.",
  },
  {
    category: "STUDY_SUPPORT",
    title: "Creating a Distraction-Free Study Space at Home",
    body: "The ideal study space doesn't need to be fancy, but a few things make a real difference: good lighting (natural light or a proper desk lamp, not just an overhead bulb), a flat surface at the right height, and — most importantly — distance from the television and other family activity.\n\nPhones and tablets not being used for the task at hand should be out of reach, not just face-down on the desk; studies consistently show even a visible, silent phone reduces focus.\n\nIf space at home is limited and a shared table has to double as a study desk, a simple 'study time' signal (like a particular placemat or box of stationery that only comes out during homework hours) can help create the right mental switch even without a dedicated room.",
  },
  // FUN_ACTIVITIES
  {
    category: "FUN_ACTIVITIES",
    title: "Weekend Family Bonding Ideas",
    body: "It doesn't take an elaborate outing to make a weekend memorable. A 'no-phones family game night' with cards, ludo, or charades once a week is simple to start and something children often look forward to more than parents expect.\n\nCooking together is another great option — let each family member pick one dish to help prepare over the weekend, even something simple like scrambled eggs or fried plantain. Children take pride in food they helped make.\n\nFor outdoor time, a walk somewhere new — a local park, market, or even just a different street — gives a small sense of adventure without needing to travel far or spend much. The goal isn't the activity itself so much as the undistracted time together.",
  },
  {
    category: "FUN_ACTIVITIES",
    title: "Simple STEM Experiments You Can Do at Home",
    body: "Hands-on science at home builds curiosity in a way worksheets often can't. Try the classic 'volcano' experiment: put two spoons of baking soda in a cup, add a few drops of food colouring and a splash of dish soap, then pour in vinegar and watch it fizz over — a great, safe way to talk about chemical reactions.\n\nFor a simple physics demonstration, fill three glasses with water at different levels and gently tap each with a spoon — the different pitches show how sound depends on the amount of water (and air) vibrating.\n\nGrowing beans in a clear cup with wet cotton wool, placed on a sunny windowsill, is a great multi-day project — children can observe and record the roots and shoots developing over about a week, a simple introduction to plant biology.",
  },
  {
    category: "FUN_ACTIVITIES",
    title: "Creative Rainy-Day Indoor Games",
    body: "When outdoor play isn't an option, a 'scavenger hunt' around the house works for almost any age — write a list of household items (something red, something soft, something that starts with 'B') and set a timer for the search.\n\nBuilding a blanket fort in the living room, with cushions and a torch, turns an ordinary afternoon into an event — reading a story together inside the fort makes it even better.\n\nFor slightly older children, a simple 'family quiz' with questions written on paper slips (mixing school subjects with fun trivia about the family itself) is an easy way to fill an hour and often ends in a lot of laughter.",
  },
];

(async () => {
  const school = await prisma.school.findFirst({ select: { id: true } });
  if (!school) throw new Error("No school found");
  let created = 0;
  for (const item of items) {
    const existing = await prisma.familyContent.findFirst({ where: { schoolId: school.id, title: item.title } });
    if (existing) continue;
    await prisma.familyContent.create({ data: { schoolId: school.id, ...item, isPublished: true } });
    created++;
  }
  console.log(`Seeded ${created} Family Corner items (${items.length - created} already existed).`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
