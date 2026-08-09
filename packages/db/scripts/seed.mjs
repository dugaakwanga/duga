// Seed script — creates a demo school with all roles and representative data.
// Run: npm run seed -w @duga/db
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";
const SCHOOL = {
  name: "De Ultimate Glory Academy",
  shortName: "DUGA",
  domain: "deultimateglory.com",
  address: "Akwanga, Nasarawa State, Nigeria",
  phone: "+234 803 000 0000",
  email: "info@deultimateglory.com",
  gpsLat: 8.9123,
  gpsLng: 8.4066,
};

async function hash(pw) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  console.log("Seeding De Ultimate Glory Academy demo data...");

  // --- School ---
  await prisma.school.upsert({
    where: { domain: SCHOOL.domain },
    update: {},
    create: { ...SCHOOL },
  });
  const school = await prisma.school.findUniqueOrThrow({
    where: { domain: SCHOOL.domain },
  });
  const schoolId = school.id;

  // --- Subscription ---
  await prisma.subscription.upsert({
    where: { schoolId },
    update: {},
    create: {
      schoolId,
      plan: "PRO",
      status: "ACTIVE",
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      seats: 500,
    },
  });

  const userPassword = await hash(DEMO_PASSWORD);

  async function upsertUser({ email, role, firstName, lastName, phone, mustChangePassword }) {
    return prisma.user.upsert({
      where: { schoolId_email: { schoolId, email } },
      update: {},
      create: {
        schoolId,
        email,
        role,
        firstName,
        lastName,
        phone,
        passwordHash: userPassword,
        status: "ACTIVE",
        mustChangePassword: mustChangePassword ?? false,
      },
    });
  }

  // --- Roles ---
  const owner = await upsertUser({ email: "owner@deultimateglory.com", role: "OWNER", firstName: "Mr.", lastName: "Proprietor", phone: "+2348010000001" });
  const admin = await upsertUser({ email: "admin@deultimateglory.com", role: "ADMIN", firstName: "Mrs.", lastName: "Registrar", phone: "+2348010000002" });
  const adminRec = await prisma.admin.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, schoolId, designation: "School Registrar" },
  });

  const teachers = {};
  for (const [key, name] of Object.entries({
    math: ["Mr.", "Okonkwo", "+2348010000010", "Mathematics"],
    eng: ["Mrs.", "Adeyemi", "+2348010000011", "English"],
    sci: ["Mr.", "Dauda", "+2348010000012", "Basic Science"],
  })) {
    const [title, lname, phone, specialty] = name;
    const user = await upsertUser({ email: `${key}@deultimateglory.com`, role: "TEACHER", firstName: title, lastName: lname, phone });
    const teacher = await prisma.teacher.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, schoolId, staffNumber: `STF-${key.toUpperCase()}`, specialty, designation: "Teacher" },
    });
    teachers[key] = teacher;
  }

  const parentUser = await upsertUser({ email: "parent@deultimateglory.com", role: "PARENT", firstName: "Chief", lastName: "Adewale", phone: "+2348010000020" });
  const parent = await prisma.parent.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: { userId: parentUser.id, schoolId, occupation: "Civil Servant", address: "Akwanga, Nasarawa" },
  });

  // --- Academic structure ---
  const session = await prisma.academicSession.upsert({
    where: { schoolId_name: { schoolId, name: "2025/2026" } },
    update: {},
    create: { schoolId, name: "2025/2026", startDate: new Date("2025-09-08"), endDate: new Date("2026-07-24"), status: "ACTIVE" },
  });

  const terms = {};
  for (const n of [1, 2, 3]) {
    const t = await prisma.term.upsert({
      where: { schoolId_sessionId_termNumber: { schoolId, sessionId: session.id, termNumber: n } },
      update: {},
      create: {
        schoolId,
        sessionId: session.id,
        termNumber: n,
        name: `${n === 1 ? "First" : n === 2 ? "Second" : "Third"} Term`,
        status: n === 1 ? "ACTIVE" : "UPCOMING",
      },
    });
    terms[n] = t;
  }

  const levels = {};
  const levelDefs = [
    { section: "PRIMARY", name: "Primary 1", order: 1 },
    { section: "PRIMARY", name: "Primary 2", order: 2 },
    { section: "PRIMARY", name: "Primary 3", order: 3 },
    { section: "PRIMARY", name: "Primary 4", order: 4 },
    { section: "PRIMARY", name: "Primary 5", order: 5 },
    { section: "PRIMARY", name: "Primary 6", order: 6 },
    { section: "SECONDARY", name: "JSS 1", order: 7 },
    { section: "SECONDARY", name: "JSS 2", order: 8 },
    { section: "SECONDARY", name: "JSS 3", order: 9 },
    { section: "SECONDARY", name: "SSS 1", order: 10 },
    { section: "SECONDARY", name: "SSS 2", order: 11 },
    { section: "SECONDARY", name: "SSS 3", order: 12 },
  ];
  for (const d of levelDefs) {
    const l = await prisma.classLevel.upsert({
      where: { schoolId_section_name: { schoolId, section: d.section, name: d.name } },
      update: {},
      create: { schoolId, section: d.section, name: d.name, order: d.order },
    });
    levels[d.name] = l;
  }

  // --- Class groups ---
  const jss1A = await prisma.classGroup.upsert({
    where: { schoolId_sessionId_levelId_name: { schoolId, sessionId: session.id, levelId: levels["JSS 1"].id, name: "JSS 1A" } },
    update: {},
    create: {
      schoolId,
      sessionId: session.id,
      levelId: levels["JSS 1"].id,
      name: "JSS 1A",
      room: "Block B - Room 4",
      formTeacherId: teachers.eng.id,
    },
  });
  const prim3 = await prisma.classGroup.upsert({
    where: { schoolId_sessionId_levelId_name: { schoolId, sessionId: session.id, levelId: levels["Primary 3"].id, name: "Primary 3A" } },
    update: {},
    create: { schoolId, sessionId: session.id, levelId: levels["Primary 3"].id, name: "Primary 3A", room: "Block A - Room 3" },
  });

  // --- Subjects ---
  const subjectNames = ["Mathematics", "English Language", "Basic Science", "Basic Technology", "Civic Education", "Social Studies", "Quantitative Reasoning", "Christian Religious Studies", "Computer Studies"];
  const subjects = {};
  for (const name of subjectNames) {
    const s = await prisma.subject.upsert({
      where: { schoolId_name_section: { schoolId, name, section: "SECONDARY" } },
      update: {},
      create: { schoolId, name, code: name.slice(0, 3).toUpperCase(), section: "SECONDARY" },
    });
    subjects[name] = s;
  }
  const primSubjects = {};
  for (const name of ["Mathematics", "English Language", "Basic Science", "Verbal Reasoning", "Quantitative Reasoning", "Creative Arts"]) {
    const s = await prisma.subject.upsert({
      where: { schoolId_name_section: { schoolId, name, section: "PRIMARY" } },
      update: {},
      create: { schoolId, name, code: name.slice(0, 3).toUpperCase(), section: "PRIMARY" },
    });
    primSubjects[name] = s;
  }

  // --- Class subjects (JSS1A) ---
  const jssSubjects = {};
  const csDefs = [
    ["Mathematics", teachers.math],
    ["English Language", teachers.eng],
    ["Basic Science", teachers.sci],
    ["Basic Technology", teachers.sci],
    ["Civic Education", teachers.eng],
  ];
  for (const [subjName, t] of csDefs) {
    const cs = await prisma.classSubject.upsert({
      where: { classGroupId_subjectId: { classGroupId: jss1A.id, subjectId: subjects[subjName].id } },
      update: {},
      create: { schoolId, classGroupId: jss1A.id, subjectId: subjects[subjName].id, teacherId: t.id, weeklyPeriods: 4 },
    });
    jssSubjects[subjName] = cs;
  }
  const primSubjectsLink = {};
  for (const name of ["Mathematics", "English Language"]) {
    const cs = await prisma.classSubject.upsert({
      where: { classGroupId_subjectId: { classGroupId: prim3.id, subjectId: primSubjects[name].id } },
      update: {},
      create: { schoolId, classGroupId: prim3.id, subjectId: primSubjects[name].id, teacherId: teachers.math.id, weeklyPeriods: 5 },
    });
    primSubjectsLink[name] = cs;
  }

  // --- Students ---
  const studentUser = await upsertUser({ email: "student@deultimateglory.com", role: "STUDENT", firstName: "Chidi", lastName: "Adewale", phone: "+2348010000030" });
  const student = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      schoolId,
      admissionNumber: "DUGA/JSS/2025/0001",
      section: "SECONDARY",
      gender: "MALE",
      isBoarding: true,
      currentClassGroupId: jss1A.id,
      dateOfBirth: new Date("2012-03-15"),
    },
  });
  await prisma.studentParent.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
    update: {},
    create: { parentId: parent.id, studentId: student.id, schoolId, relation: "FATHER", isPrimary: true },
  });

  // Second student (sibling) — primary section
  const studentUser2 = await upsertUser({ email: "sibling@deultimateglory.com", role: "STUDENT", firstName: "Ada", lastName: "Adewale", phone: "+2348010000031" });
  const student2 = await prisma.student.upsert({
    where: { userId: studentUser2.id },
    update: {},
    create: {
      userId: studentUser2.id,
      schoolId,
      admissionNumber: "DUGA/PRY/2025/0002",
      section: "PRIMARY",
      gender: "FEMALE",
      currentClassGroupId: prim3.id,
    },
  });
  await prisma.studentParent.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student2.id } },
    update: {},
    create: { parentId: parent.id, studentId: student2.id, schoolId, relation: "FATHER" },
  });

  // --- Fees ---
  const feeTuition = await prisma.feeType.upsert({
    where: { schoolId_name: { schoolId, name: "Tuition" } },
    update: {},
    create: { schoolId, name: "Tuition" },
  });
  const feeHostel = await prisma.feeType.upsert({
    where: { schoolId_name: { schoolId, name: "Hostel" } },
    update: {},
    create: { schoolId, name: "Hostel", isOptional: true },
  });
  await prisma.feeStructure.upsert({
    where: { id: "seed-fs-tuition-jss" },
    update: {},
    create: {
      id: "seed-fs-tuition-jss",
      schoolId,
      feeTypeId: feeTuition.id,
      section: "SECONDARY",
      levelId: levels["JSS 1"].id,
      amount: 85000,
    },
  });
  await prisma.feeStructure.upsert({
    where: { id: "seed-fs-hostel" },
    update: {},
    create: { id: "seed-fs-hostel", schoolId, feeTypeId: feeHostel.id, section: "SECONDARY", amount: 30000 },
  });

  // --- Invoice for the boarding student ---
  const invoice = await prisma.invoice.upsert({
    where: { schoolId_studentId_termId: { schoolId, studentId: student.id, termId: terms[1].id } },
    update: {},
    create: {
      schoolId,
      studentId: student.id,
      termId: terms[1].id,
      invoiceNumber: `INV-2025-0001`,
      totalAmount: 115000,
      paidAmount: 85000,
      balance: 30000,
      status: "PARTIAL",
      issuedAt: new Date("2025-09-05"),
      dueDate: new Date("2025-09-30"),
    },
  });
  await prisma.invoiceItem.createMany({
    data: [
      { invoiceId: invoice.id, description: "Tuition (First Term)", amount: 85000, feeTypeId: feeTuition.id },
      { invoiceId: invoice.id, description: "Hostel (First Term)", amount: 30000, feeTypeId: feeHostel.id },
    ],
  });

  // --- Lesson note + assignment + test (sample learning content) ---
  const mathCS = jssSubjects["Mathematics"];
  await prisma.lessonNote.create({
    data: {
      schoolId,
      classSubjectId: mathCS.id,
      teacherId: teachers.math.id,
      termId: terms[1].id,
      week: 1,
      topic: "Whole Numbers and Place Value",
      content: "In this lesson we review whole numbers up to millions, place values and number expansion.",
    },
  });
  const assignment = await prisma.assignment.create({
    data: {
      schoolId,
      classSubjectId: mathCS.id,
      teacherId: teachers.math.id,
      termId: terms[1].id,
      title: "Place Value Worksheet",
      instructions: "Answer all questions and submit before the due date.",
      dueAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      maxScore: 100,
      isPublished: true,
    },
  });
  await prisma.assignmentSubmission.upsert({
    where: { id: "seed-sub-1" },
    update: { score: 78, gradedAt: new Date(), gradedByTeacherId: teachers.math.id },
    create: {
      id: "seed-sub-1",
      schoolId,
      assignmentId: assignment.id,
      studentId: student.id,
      content: "Submitted via seed.",
      score: 78,
      gradedAt: new Date(),
      gradedByTeacherId: teachers.math.id,
    },
  });
  const test = await prisma.test.create({
    data: {
      schoolId,
      classSubjectId: mathCS.id,
      teacherId: teachers.math.id,
      termId: terms[1].id,
      title: "Number Bases Quiz",
      description: "CBT-style objective test.",
      durationMinutes: 20,
      status: "PUBLISHED",
      isAutoGraded: true,
    },
  });
  await prisma.testQuestion.createMany({
    data: [
      { testId: test.id, question: "What is the place value of 5 in 45,832?", options: ["Hundreds", "Thousands", "Ten thousands", "Units"], correctIndex: 1, score: 2 },
      { testId: test.id, question: "6 x 7 = ?", options: ["42", "36", "48", "40"], correctIndex: 0, score: 2 },
      { testId: test.id, question: "The square root of 144 is:", options: ["12", "14", "11", "16"], correctIndex: 0, score: 2 },
    ],
  });

  // --- Sample live class ---
  await prisma.liveClass.create({
    data: {
      schoolId,
      classSubjectId: mathCS.id,
      teacherId: teachers.math.id,
      title: "Live: Fractions and Decimals",
      description: "Interactive online class on fractions.",
      scheduledAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      durationMinutes: 45,
      roomName: `duga-math-${Date.now()}`,
      joinLink: `https://meet.jit.si/duga-math-${Date.now()}`,
      status: "SCHEDULED",
    },
  });

  // --- Hostel ---
  const hostel = await prisma.hostel.upsert({
    where: { id: "seed-hostel-m" },
    update: {},
    create: { id: "seed-hostel-m", schoolId, name: "Boys Hostel", gender: "MALE", capacity: 60 },
  });
  const room = await prisma.hostelRoom.upsert({
    where: { id: "seed-room-101" },
    update: {},
    create: { id: "seed-room-101", hostelId: hostel.id, roomNumber: "101", floor: 1, capacity: 4 },
  });
  const bed = await prisma.hostelBed.upsert({
    where: { id: "seed-bed-101-1" },
    update: {},
    create: { id: "seed-bed-101-1", roomId: room.id, bedNumber: "1", isOccupied: true },
  });
  await prisma.hostelAllocation.upsert({
    where: { id: "seed-ha-1" },
    update: {},
    create: {
      id: "seed-ha-1",
      schoolId,
      studentId: student.id,
      hostelId: hostel.id,
      roomId: room.id,
      bedId: bed.id,
      termId: terms[1].id,
      allocatedBy: adminRec.id,
      status: "ACTIVE",
    },
  });

  // --- Timetable entries for JSS1A ---
  const days = [1, 2, 3, 4, 5];
  const periods = [
    ["Maths", jssSubjects["Mathematics"], teachers.math, "8:00", "8:40"],
    ["English", jssSubjects["English Language"], teachers.eng, "8:40", "9:20"],
    ["Science", jssSubjects["Basic Science"], teachers.sci, "9:20", "10:00"],
  ];
  for (const day of days) {
    let i = 0;
    for (const [label, cs, t, start, end] of periods) {
      i += 1;
      await prisma.timetableEntry.create({
        data: {
          schoolId,
          termId: terms[1].id,
          classGroupId: jss1A.id,
          classSubjectId: cs.id,
          subjectId: cs.subjectId,
          teacherId: t.id,
          dayOfWeek: day,
          periodNumber: i,
          startTime: start,
          endTime: end,
          room: "Block B - Room 4",
        },
      });
    }
  }

  // --- Transport ---
  const route = await prisma.transportRoute.upsert({
    where: { id: "seed-route-1" },
    update: {},
    create: { id: "seed-route-1", schoolId, name: "Akwanga Town Loop", fee: 15000 },
  });
  const stop = await prisma.transportStop.upsert({
    where: { id: "seed-stop-1" },
    update: {},
    create: { id: "seed-stop-1", routeId: route.id, name: "Main Market", order: 1, lat: 8.905, lng: 8.41, pickupTime: "06:45" },
  });
  const vehicle = await prisma.vehicle.upsert({
    where: { id: "seed-vehicle-1" },
    update: {},
    create: { id: "seed-vehicle-1", schoolId, plateNumber: "NAS-123-XY", model: "Toyota Hiace", capacity: 18, routeId: route.id },
  });
  const driver = await prisma.driver.upsert({
    where: { id: "seed-driver-1" },
    update: {},
    create: { id: "seed-driver-1", schoolId, name: "Alhaji Musa", phone: "+2348010000040", licenseNumber: "NG-9001", vehicleId: vehicle.id },
  });
  await prisma.transportAssignment.upsert({
    where: { studentId_status: { studentId: student.id, status: "ACTIVE" } },
    update: { routeId: route.id, stopId: stop.id, termId: terms[1].id },
    create: { id: "seed-ta-1", schoolId, studentId: student.id, routeId: route.id, stopId: stop.id, termId: terms[1].id, status: "ACTIVE" },
  });

  // --- Announcements ---
  await prisma.announcement.create({
    data: {
      schoolId,
      authorId: admin.id,
      title: "Welcome to the 2025/2026 Academic Session",
      body: "All students are expected to resume with their parents on Monday. Fee payment closes on the 30th.",
      audience: "EVERYONE",
    },
  });

  // --- Grading scheme ---
  await prisma.gradingScheme.upsert({
    where: { schoolId_name: { schoolId, name: "WAEC-style (8-point)" } },
    update: {},
    create: {
      schoolId,
      name: "WAEC-style (8-point)",
      isDefault: true,
      scale: [
        { min: 75, max: 100, grade: "A1", remark: "Excellent", gp: 8 },
        { min: 70, max: 74, grade: "B2", remark: "Very Good", gp: 7 },
        { min: 65, max: 69, grade: "B3", remark: "Good", gp: 6 },
        { min: 60, max: 64, grade: "C4", remark: "Credit", gp: 5 },
        { min: 55, max: 59, grade: "C5", remark: "Credit", gp: 4 },
        { min: 50, max: 54, grade: "C6", remark: "Credit", gp: 3 },
        { min: 45, max: 49, grade: "D7", remark: "Pass", gp: 2 },
        { min: 40, max: 44, grade: "E8", remark: "Pass", gp: 1 },
        { min: 0, max: 39, grade: "F9", remark: "Fail", gp: 0 },
      ],
    },
  });

  // --- Super admin ---
  await prisma.superAdmin.upsert({
    where: { username: "creator" },
    update: {},
    create: {
      username: "creator",
      passwordHash: await hash("creator123"),
      name: "Platform Creator",
    },
  });

  // --- School settings (contact + geofence) ---
  await prisma.schoolSetting.upsert({
    where: { schoolId_key: { schoolId, key: "contact" } },
    update: {},
    create: { schoolId, key: "contact", value: { phone: SCHOOL.phone, email: SCHOOL.email, address: SCHOOL.address } },
  });
  await prisma.schoolSetting.upsert({
    where: { schoolId_key: { schoolId, key: "attendance" } },
    update: {},
    create: { schoolId, key: "attendance", value: { radiusMeters: 150 } },
  });

  // --- Website news (published, appears on the public site) ---
  const initialNews = [
    {
      slug: "2025-2026-session-resumption",
      title: "Resumption Date for the 2025/2026 Academic Session",
      category: "Announcement",
      excerpt: "All students and parents are kindly informed that the new academic session begins on Monday, 8th September 2025.",
      body: [
        "The management of De Ultimate Glory Academy is pleased to announce that the 2025/2026 academic session will commence on Monday, 8th September 2025. All boarding students are expected to resume on Sunday, 7th September 2025.",
        "Parents are encouraged to complete fee payment and hostel clearance before the first day of school to avoid disruption to their wards' learning.",
        "New students and their parents/guardians should visit the admissions office with their required documents on or before resumption day.",
      ],
      publishedAt: new Date("2025-08-25T08:00:00Z"),
    },
    {
      slug: "jss3-basic-certificate-results",
      title: "JSS 3 Students Excel in 2025 Basic Education Examination",
      category: "Achievement",
      excerpt: "Our JSS 3 candidates recorded a 98% pass rate in the 2025 Basic Education Certificate Examination.",
      body: [
        "De Ultimate Glory Academy celebrates our JSS 3 candidates who sat for the 2025 Basic Education Certificate Examination (BECE). The school recorded a 98% credit pass rate, with several students scoring distinctions in Mathematics and English Language.",
        "This remarkable feat is a testament to the dedication of our teachers and the rigorous academic standards of the school.",
        "We congratulate the students and their parents, and we look forward to welcoming them back into our Senior Secondary School programme.",
      ],
      publishedAt: new Date("2025-07-15T08:00:00Z"),
    },
    {
      slug: "new-science-laboratory",
      title: "Commissioning of New Integrated Science Laboratory",
      category: "Facilities",
      excerpt: "DUGA has commissioned a modern integrated science laboratory to support hands-on learning in the sciences.",
      body: [
        "As part of our commitment to 21st-century education, De Ultimate Glory Academy has commissioned a new integrated science laboratory equipped for Biology, Chemistry and Physics practical work.",
        "The facility will enable our primary and secondary students to conduct experiments safely and deepen their understanding of scientific concepts.",
        "We thank the proprietors, staff, parents and friends of the school whose generosity made this project a reality.",
      ],
      publishedAt: new Date("2025-06-02T08:00:00Z"),
    },
    {
      slug: "inter-house-sports-festival",
      title: "Inter-House Sports Festival Holds in Grand Style",
      category: "Events",
      excerpt: "The annual inter-house sports festival brought together students, staff and parents for a day of athletics and fun.",
      body: [
        "The annual De Ultimate Glory Academy Inter-House Sports Festival took place on the school field with the Red, Blue, Green and Yellow houses competing in athletics, relay races and field events.",
        "Green House emerged as the overall champion. We commend all students for their sportsmanship and team spirit.",
        "Special thanks to the staff, parents and volunteers who ensured the event was a resounding success.",
      ],
      publishedAt: new Date("2025-04-20T08:00:00Z"),
    },
  ];
  for (const post of initialNews) {
    const existing = await prisma.newsPost.findUnique({
      where: { schoolId_slug: { schoolId, slug: post.slug } },
    });
    if (!existing) {
      await prisma.newsPost.create({
        data: {
          schoolId,
          slug: post.slug,
          title: post.title,
          category: post.category,
          excerpt: post.excerpt,
          body: post.body,
          authorId: admin.id,
          isPublished: true,
          publishedAt: post.publishedAt,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log("\nDemo accounts (password: " + DEMO_PASSWORD + "):");
  console.log("  owner@deultimateglory.com   (Owner)");
  console.log("  admin@deultimateglory.com   (Admin/Registrar)");
  console.log("  math@deultimateglory.com    (Teacher)");
  console.log("  parent@deultimateglory.com  (Parent - linked to 2 children)");
  console.log("  student@deultimateglory.com (Student - JSS1A, boarding)");
  console.log("\nSuper Admin (isolated panel at /superadmin):");
  console.log("  creator / creator123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
