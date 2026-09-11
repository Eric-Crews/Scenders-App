import type { Request } from "express";
import { ctaBand, escapeHtml, originFor, renderShell } from "./ssrShared";

const OG_IMAGE_PATH = "/opengraph.jpg";

type GuideSection = {
  heading: string;
  paragraphs: string[];
  checklist?: string[];
};

type GuideFaq = {
  question: string;
  answer: string;
};

export type FieldGuide = {
  slug: string;
  title: string;
  metaDescription: string;
  audience: string;
  published: string;
  readingMinutes: number;
  intro: string;
  sections: GuideSection[];
  faqs: GuideFaq[];
  related: string[];
};

export type CommunityFieldNoteSummary = {
  slug: string;
  title: string;
  excerpt: string;
  locationName: string | null;
  author: string | null;
  createdAt: Date;
};

const guides: FieldGuide[] = [
  {
    slug: "offline-field-mapping-guide",
    title: "Offline Field Mapping: A Practical Guide for No-Signal Work",
    metaDescription:
      "Learn a practical offline field mapping workflow: prepare data, cache map areas, capture waypoints, and bring useful notes home from no-signal work.",
    audience: "Field crews and outdoor teams",
    published: "2026-06-03",
    readingMinutes: 7,
    intro:
      "Cell coverage is a convenience, not a field plan. A reliable offline mapping workflow gives a crew a shared reference, preserves observations when a phone cannot reach the internet, and makes the handoff back at the truck far less error-prone.",
    sections: [
      {
        heading: "Start with the decisions the map must support",
        paragraphs: [
          "Before downloading anything, write down what the team needs to find, record, and report. A vegetation crew may need treatment boundaries and photo points. A trail crew may need a route, drainage issues, and work locations. The useful map is the one that answers those field questions without asking people to improvise a naming system halfway through the day.",
          "Keep the first field map focused. Bring a route or boundary, a few meaningful layers, and an agreed waypoint convention. A crowded phone screen can hide the one line or note that matters when weather, gloves, and time are working against you.",
        ],
        checklist: [
          "Choose the route, boundary, or imported dataset needed for the day.",
          "Agree on a waypoint naming pattern before leaving coverage.",
          "Decide what notes and photos must be captured for the final handoff.",
        ],
      },
      {
        heading: "Prepare offline maps before the field day",
        paragraphs: [
          "Open the work area while connected and save the region you expect to use. In mapper.one, offline OpenStreetMap tiles and imported KML, KMZ, GeoJSON, and GPX files can be carried on the phone, so the map does not depend on a signal once you arrive.",
          "Preparation should include a realistic boundary around the work, not only the access road. Give the team enough map around a route for detours, navigation checks, and a return path. Then switch connectivity off briefly and confirm the intended area still makes sense on the device.",
        ],
      },
      {
        heading: "Capture evidence that is understandable later",
        paragraphs: [
          "A pin without context becomes a mystery after a long day. Use short notes that identify the observation, the condition, and the requested next step. Photos are most useful when paired with a note that says what the camera was meant to show.",
          "At the end of the day, review the recorded track and waypoints before the crew disperses. Correct obvious names while the site is still fresh, then share or export the work through the process your team already uses. Offline capture is only valuable if the information remains usable after it leaves the field.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can a phone map work with no cell service?",
        answer:
          "Yes, when the needed map area and data are prepared in advance. GPS positioning can still work without mobile data; the important step is carrying the basemap and reference layers before leaving coverage.",
      },
      {
        question: "What file formats are practical for field maps?",
        answer:
          "GPX is common for routes, while GeoJSON, KML, and KMZ are useful for lines, points, and boundaries. mapper.one supports all four on the phone.",
      },
    ],
    related: ["trail-maintenance-mapping", "conservation-field-data-collection"],
  },
  {
    slug: "trail-maintenance-mapping",
    title: "Trail Maintenance Mapping: Track Work, Hazards, and Follow-Up",
    metaDescription:
      "Build a repeatable trail maintenance mapping workflow for recording work locations, drainage issues, hazards, and follow-up tasks from the field.",
    audience: "Trail builders and stewardship crews",
    published: "2026-06-10",
    readingMinutes: 6,
    intro:
      "A maintenance day produces more than a cleaner trail. It produces decisions for the next crew: where water is cutting a tread, which bridge needs an inspection, and what materials should return to the site. A simple map turns those observations into continuity.",
    sections: [
      {
        heading: "Use the trail line as the crew’s common reference",
        paragraphs: [
          "Load or record the route before assigning work. A shared line helps volunteers describe locations by a visible point on the map rather than by a vague distance from the trailhead. It also gives the next crew a reliable way to follow the same corridor.",
          "If an official alignment is available, import it as GPX, KML, or GeoJSON. If not, record a fresh track while walking the route. The goal is not survey-grade precision; it is a useful field reference for work planning and follow-up.",
        ],
      },
      {
        heading: "Capture the condition, not just the coordinate",
        paragraphs: [
          "Place waypoints for problems that need a second look: blocked drainage, a failing structure, a safety hazard, an erosion pinch point, or a completed repair. Write a short condition note and attach a photo when the visual detail will help another person recognize the issue.",
          "Make names consistent. Labels such as DRAIN-01, HAZ-02, and WORK-03 are easier to scan than improvised phrases. Put the plain-language explanation in the note, where it can carry the details without making the map unreadable.",
        ],
        checklist: [
          "Record a route or load the official alignment.",
          "Use one waypoint label pattern for the whole workday.",
          "Photograph both the problem and major completed repairs when helpful.",
        ],
      },
      {
        heading: "Turn a workday into a handoff",
        paragraphs: [
          "Review the points at the end of the day while crew members can clarify what happened. Mark completed work clearly and separate observations that still need materials, permission, or a specialist. This keeps a maintenance map from becoming an unfiltered list of old issues.",
          "For a public volunteer update, share only the route and information appropriate for public access. Sensitive sites, unsafe hazards, and stewardship decisions may need a controlled handoff instead of a public link.",
        ],
      },
    ],
    faqs: [
      {
        question: "Should trail crews map every small task?",
        answer:
          "No. Map work that affects future planning, safety, materials, or repeat inspections. A selective map is easier for the next crew to act on.",
      },
      {
        question: "Can volunteers use their own phones?",
        answer:
          "Yes, provided everyone agrees on the route, labeling, and handoff process. A lightweight shared convention matters more than identical hardware.",
      },
    ],
    related: ["volunteer-trail-crew-mapping", "land-stewardship-field-mapping"],
  },
  {
    slug: "search-and-rescue-field-mapping",
    title: "Field Mapping for Search and Rescue Teams: A Practical Companion",
    metaDescription:
      "A practical guide to using offline maps, GPX routes, and disciplined waypoint notes as a field mapping companion for search and rescue teams.",
    audience: "Search and rescue volunteers",
    published: "2026-06-17",
    readingMinutes: 7,
    intro:
      "Search and rescue operations rely on established incident command, communications, and evidence procedures. A phone mapping app is not a replacement for those systems. It can, however, help an individual field team carry a prepared route, see its own GPS position, and record clear observations when coverage is absent.",
    sections: [
      {
        heading: "Carry the operational map, not a personal substitute",
        paragraphs: [
          "Use the map products, coordinate format, and assignment process set by the incident. Load only data you are authorized to carry and share. If a team receives a search segment, access route, or clue location as a GPX, KML, or GeoJSON file, keep the original name and version visible on the device.",
          "Download the required map area before deployment and check the phone’s battery plan. A map that works offline is helpful only if the device remains powered and the team continues to follow radio and safety procedures.",
        ],
      },
      {
        heading: "Make observation notes useful to the next person",
        paragraphs: [
          "When policy permits, use a waypoint for an observation that needs a documented location. Record what was observed, when, by whom, and the action taken or requested. Avoid vague labels such as “interesting” or “check later.”",
          "Do not put sensitive subject details, evidence descriptions, or operational information into a public link. Follow the incident’s chain of custody, report format, and data-retention rules. Mapper.one’s private sharing can support a view-only handoff, but local policy comes first.",
        ],
      },
      {
        heading: "Use the recorded track as a field memory aid",
        paragraphs: [
          "A recorded or followed route can help a team confirm the corridor it walked and avoid an accidental parallel pass. It is not proof of a complete search, nor is phone GPS a substitute for the team’s established tracking and navigation methods.",
          "At demobilization, export or share only through the incident-approved workflow. Review the route and waypoint notes while memories are fresh, then preserve the official record where the incident team expects it.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is mapper.one a search and rescue command system?",
        answer:
          "No. It is a field mapping companion. Teams should continue using their incident command, communications, tracking, and evidence procedures.",
      },
      {
        question: "Can search assignments be carried offline?",
        answer:
          "Yes, if the assignment data and map area are loaded before deployment. Confirm the current version with the incident before leaving coverage.",
      },
    ],
    related: ["offline-field-mapping-guide", "wildfire-preplanning-maps"],
  },
  {
    slug: "forestry-field-mapping",
    title: "Forestry Field Mapping: Carry Stands, Roads, and Observations Offline",
    metaDescription:
      "Learn how forestry crews can carry stand boundaries, access roads, and field observations offline using practical mobile mapping workflows.",
    audience: "Foresters and woodland crews",
    published: "2026-06-24",
    readingMinutes: 6,
    intro:
      "Forestry work often crosses large tracts where a marked road becomes a skid trail, coverage disappears, and the useful information lives in a boundary file maintained somewhere else. A phone-first field map makes those references easier to carry without pretending to replace a forest inventory system.",
    sections: [
      {
        heading: "Bring the layers that explain the stand",
        paragraphs: [
          "Prepare a small field package: stand or compartment boundaries, roads and gates, planned units, water crossings, and the route to the work area. GeoJSON and KML are convenient for boundaries and points; GPX is useful for planned travel routes.",
          "Give each file a clear date and source. A forestry map can look trustworthy even when it is old, so crews should know whether a boundary or road layer reflects the current plan.",
        ],
      },
      {
        heading: "Record decisions where they happened",
        paragraphs: [
          "Use waypoints to document observations that need to return to a planner: a blocked access point, a stream crossing concern, a stand condition note, a boundary question, or a location that needs a later visit. Add a brief note explaining the decision, not just the feature.",
          "Photos are especially useful when they answer a specific question. Pair each image with a note such as “culvert inlet blocked by slash” or “gate sign missing at north access,” so a colleague understands what to look for without replaying the entire day.",
        ],
      },
      {
        heading: "Respect data sensitivity",
        paragraphs: [
          "Woodland plans can include private access, sensitive habitat, cultural resources, or harvest information. Keep those layers within the team’s approved process. Do not use a public route link for data that should remain controlled.",
          "For a simple field handoff, an owner-controlled private project link can keep a route and its notes view-only for recipients. It is still important to follow organizational policy for data storage and sharing.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can mapper.one replace a forestry inventory system?",
        answer:
          "No. It is best used as a lightweight field companion for carrying selected map layers, recording routes, and capturing observations.",
      },
      {
        question: "Which data should stay private?",
        answer:
          "Treat access routes, private land information, sensitive habitat, and operational plans according to your organization’s policies. Share only what recipients are authorized to see.",
      },
    ],
    related: ["land-stewardship-field-mapping", "conservation-field-data-collection"],
  },
  {
    slug: "arborist-crew-mapping",
    title: "Arborist Crew Mapping: Document Trees, Access, and Site Notes",
    metaDescription:
      "A practical mobile mapping workflow for arborist crews to document tree locations, site access, hazards, photos, and follow-up work.",
    audience: "Arborists and tree-care crews",
    published: "2026-07-01",
    readingMinutes: 6,
    intro:
      "Tree-care work is full of location-specific details: a gate that changes access, a tree that needs a second estimate, a hazard noted after a storm, or a site question that becomes unclear once the crew leaves. A mapped note can keep those details tied to the right place.",
    sections: [
      {
        heading: "Build a simple site map before the walk-through",
        paragraphs: [
          "Load the property boundary, site access, and any relevant work route before arriving. Keep the map focused on field decisions rather than trying to reproduce a full asset-management system on a phone.",
          "For recurring sites, use a consistent naming pattern for trees or work areas. A label such as TREE-12 paired with a clear note is easier to match with a work order than a long, improvised title.",
        ],
      },
      {
        heading: "Use photos as a visual annotation",
        paragraphs: [
          "A photo is most helpful when it answers the question a crew member will ask later: which limb, which side of the tree, which access constraint, or which nearby target matters. Attach a short note that states the condition and the recommended next step.",
          "Capture route or access notes separately from tree observations. Mixing the two makes it harder for the estimator, climber, or equipment operator to find the information they need.",
        ],
      },
      {
        heading: "Know the limits of a phone coordinate",
        paragraphs: [
          "Phone GPS is suitable for practical field reference, but it is not a survey instrument. If a job requires legal boundaries, utility locating, or survey-grade measurements, use the licensed professionals and equipment required for that work.",
          "The goal is an understandable field record: where the crew was, what it observed, and what should happen next. Export or share that record through the company’s approved client and privacy process.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can a crew map individual trees with a phone?",
        answer:
          "Yes, for practical field reference and notes. The coordinate accuracy should not be treated as a legal boundary or survey-grade measurement.",
      },
      {
        question: "What should an arborist photo note include?",
        answer:
          "Name the feature, describe the condition, and state the needed action. This makes the image useful to someone who was not at the site.",
      },
    ],
    related: ["survey-field-notes-mapping", "offline-field-mapping-guide"],
  },
  {
    slug: "conservation-field-data-collection",
    title: "Conservation Field Data Collection: Map Observations Without Signal",
    metaDescription:
      "Use offline maps, consistent waypoints, and photo notes to collect practical conservation field observations without depending on cell coverage.",
    audience: "Conservation crews and land managers",
    published: "2026-07-08",
    readingMinutes: 7,
    intro:
      "Conservation fieldwork often begins with a question and ends with a collection of observations that need to be defensible, understandable, and connected to a place. A field map does not replace a monitoring protocol, but it can make a protocol easier to follow where there is no signal.",
    sections: [
      {
        heading: "Let the monitoring plan define the map",
        paragraphs: [
          "Start with the project’s approved protocol: sampling areas, observation categories, data fields, and privacy requirements. Then load only the reference layers needed to make those decisions in the field, such as management units, access routes, or prior monitoring locations.",
          "A simple category system protects the quality of the data. Use consistent waypoint names or prefixes for observations and put the supporting context in the note. This is more useful than relying on memory during a later transcription.",
        ],
      },
      {
        heading: "Collect notes that survive the return trip",
        paragraphs: [
          "Record the observation, its condition, and any follow-up action while standing at the location. When a photo is appropriate, add a note explaining what it documents and avoid capturing sensitive details that should not move beyond the project team.",
          "Review the map before leaving the site. It is much easier to clarify a missed label or duplicate point while the landscape and project objective are still in front of the crew.",
        ],
      },
      {
        heading: "Separate field reference from the system of record",
        paragraphs: [
          "Mapper.one is useful for carrying selected data, recording tracks, and adding location-aware notes and photos. It should feed the organization’s established system of record rather than create a parallel, undocumented database.",
          "For sensitive species, cultural resources, or private land information, follow access controls and data policies. Do not publish public route links that could reveal locations requiring protection.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can mapper.one replace a conservation database?",
        answer:
          "No. Use it as a field companion for navigation and capture, then move approved observations into the project’s system of record.",
      },
      {
        question: "How should sensitive species locations be handled?",
        answer:
          "Follow the project’s access and sharing rules. Sensitive coordinates should not be placed in public route links or casually shared map exports.",
      },
    ],
    related: ["forestry-field-mapping", "land-stewardship-field-mapping"],
  },
  {
    slug: "land-stewardship-field-mapping",
    title: "Land Stewardship Mapping: Turn Site Walks Into Useful Follow-Up",
    metaDescription:
      "A practical guide for land stewards to map site walks, access needs, restoration observations, and maintenance follow-up with an offline phone map.",
    audience: "Land trusts and property stewards",
    published: "2026-07-15",
    readingMinutes: 6,
    intro:
      "A site walk can reveal a broken fence, a new invasive patch, an access concern, and three projects worth returning to. A stewardship map gives those observations a durable place between one visit and the next.",
    sections: [
      {
        heading: "Carry the right reference layers",
        paragraphs: [
          "Load the property boundary, easements or management units appropriate for the team, trail and access routes, and any locations that need recurring observation. Clear layers reduce the chance that a field note becomes detached from the property context.",
          "Keep versions visible. A stewardship map often combines information from different sources, so a short source/date note helps the next user understand what they are seeing.",
        ],
      },
      {
        heading: "Make recurring visits comparable",
        paragraphs: [
          "Name locations consistently so repeat visits build a history instead of a pile of disconnected pins. A note can record the condition, the date, and the next action; a photo can show a change only when it is tied to the same location and purpose.",
          "Record the route used to reach a site when access itself is a concern. It can save time for a volunteer or contractor who needs to find the same gate, crossing, or trail junction later.",
        ],
      },
      {
        heading: "Share only the map that belongs in the handoff",
        paragraphs: [
          "A public link can be useful for a trail route or volunteer event. Property details, sensitive locations, and access plans often require a different channel. Decide what the recipient needs before sharing a route or dataset.",
          "A clear map handoff combines the route, named observations, and the next action. It does not need every historical note or every layer to be useful.",
        ],
      },
    ],
    faqs: [
      {
        question: "What should a stewardship waypoint record?",
        answer:
          "Record the feature, current condition, date or visit context, and the next action. Add a photo only when it clarifies what needs attention.",
      },
      {
        question: "Can public route links expose sensitive locations?",
        answer:
          "They can. Use public sharing only for information suitable for public access, and keep sensitive data within the approved team workflow.",
      },
    ],
    related: ["conservation-field-data-collection", "trail-maintenance-mapping"],
  },
  {
    slug: "survey-field-notes-mapping",
    title: "Survey Field Notes on a Map: A Better Mobile Reference Workflow",
    metaDescription:
      "Use a mobile map to organize practical survey field notes, access routes, photos, and follow-up locations without treating phone GPS as survey-grade data.",
    audience: "Survey support crews and field technicians",
    published: "2026-07-22",
    readingMinutes: 6,
    intro:
      "Survey work has high standards for measurement, control, and legal recordkeeping. A mobile map should not blur those standards. Its best role is a practical companion: carry an approved reference layer, follow access routes, and tie photos or non-authoritative notes to a field location.",
    sections: [
      {
        heading: "Separate reference mapping from measured work",
        paragraphs: [
          "Use the mobile map for context: access routes, planned walk paths, site photos, utility-call notes, and non-authoritative observations. Treat professional instruments, field books, and approved data collectors as the source for survey measurements and legal deliverables.",
          "This separation prevents a common problem: an approximate phone point gets copied into a workflow where someone later assumes it is survey-grade. Clear labels protect the quality of the final record.",
        ],
      },
      {
        heading: "Make site access repeatable",
        paragraphs: [
          "Record the route to an occupation point, gate, or safe parking area when that information will help another crew. Waypoints can hold a concise access note, a photo of a landmark, or a reminder about conditions encountered on the visit.",
          "Bring relevant non-sensitive boundaries or control-area references as KML, KMZ, GeoJSON, or GPX. Confirm they are approved for use and current before relying on them in the field.",
        ],
      },
      {
        heading: "Handoff notes with their limitations intact",
        paragraphs: [
          "When sharing a field map, state that its locations are visual references unless they came from the approved survey workflow. This protects clients and colleagues from treating a convenient map view as a legal product.",
          "Use the app to reduce friction around the workday, not to replace the responsibilities that require licensed judgment and precision equipment.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is phone GPS accurate enough for survey work?",
        answer:
          "It is useful for approximate field reference and navigation, not as a replacement for survey-grade instruments, control, or licensed professional judgment.",
      },
      {
        question: "What is appropriate to record on the phone map?",
        answer:
          "Access, non-authoritative observations, site photos, planned routes, and follow-up locations are common uses. Follow your organization’s data policies.",
      },
    ],
    related: ["arborist-crew-mapping", "offline-field-mapping-guide"],
  },
  {
    slug: "tour-operator-route-mapping",
    title: "Tour Operator Route Mapping: Share Clear, View-Only Field Routes",
    metaDescription:
      "A practical route-mapping workflow for tour operators: prepare routes offline, capture field notes, and share clear view-only information with staff and guests.",
    audience: "Guides and tour operators",
    published: "2026-07-29",
    readingMinutes: 6,
    intro:
      "A good guest route is more than a line on a screen. It has access notes, decision points, weather-aware alternatives, and an understanding of what should not be shared publicly. A field map can help an operator prepare, test, and hand off that route with less ambiguity.",
    sections: [
      {
        heading: "Prepare the route before guests arrive",
        paragraphs: [
          "Plot or import the intended route and carry the map area offline. Walk or drive the route when possible, then add practical notes for staging, meeting points, turnarounds, water, or locations where a guide may need to make a decision.",
          "Treat the map as a supporting tool, not a substitute for professional guiding judgment. Weather, group ability, permits, and local conditions can change the right plan on the day.",
        ],
      },
      {
        heading: "Make the handoff simple for staff",
        paragraphs: [
          "Staff need the current route and the notes that matter to their role. A view-only private project link can provide a shareable route with owner-controlled revocation for internal demonstrations or operational handoffs. Public links should contain only information appropriate for public viewing.",
          "Keep a clear version name and date. If a route changes, retire the old link or label it as superseded so a staff member does not guide from yesterday’s plan.",
        ],
      },
      {
        heading: "Protect sensitive locations and expectations",
        paragraphs: [
          "Do not publish locations that depend on private access, fragile resources, or permit conditions. Guests can be given the information they need without exposing every operational detail.",
          "A responsible route page explains what the map can and cannot do. It does not promise emergency coverage, real-time safety monitoring, or a fixed itinerary when conditions require a different decision.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can a route link be shared with staff without accounts?",
        answer:
          "A private project link is view-only and can be shared with recipients without requiring them to edit the route. Use it only for information appropriate for that audience.",
      },
      {
        question: "Should every tour route be public?",
        answer:
          "No. Private access, sensitive areas, and operational notes should remain within the appropriate team process.",
      },
    ],
    related: ["event-course-mapping", "offline-field-mapping-guide"],
  },
  {
    slug: "outdoor-education-field-mapping",
    title: "Outdoor Education Mapping: Build Better Field Observation Activities",
    metaDescription:
      "Use simple offline maps, waypoints, and photo notes to support outdoor education activities without turning the lesson into a screen-first experience.",
    audience: "Outdoor educators and youth programs",
    published: "2026-08-05",
    readingMinutes: 6,
    intro:
      "A map can deepen an outdoor lesson when it helps learners notice where they are, connect observations to a landscape, and tell a clear story afterward. The phone should support that experience, not pull attention away from it.",
    sections: [
      {
        heading: "Design the observation before opening the app",
        paragraphs: [
          "Choose a small number of questions that fit the place: where water enters a trail system, how vegetation changes along a slope, or what evidence shows human use. Then decide which observations deserve a waypoint, note, or photo.",
          "Clear constraints make a better activity. Ask learners to record one accurate location and one thoughtful note rather than collecting dozens of unlabeled pins.",
        ],
      },
      {
        heading: "Prepare for no signal and varied devices",
        paragraphs: [
          "Load the route and map area in advance. This avoids making a lesson depend on coverage and gives staff a chance to test the map before the group arrives. Pair participants when appropriate so the activity does not require every learner to use a phone.",
          "Use an agreed naming convention and explain what information should not be recorded. Sensitive sites, other participants, and private property all deserve a privacy conversation before the activity begins.",
        ],
      },
      {
        heading: "Reflect on the map after the walk",
        paragraphs: [
          "The most valuable part often happens after the route is complete. Review the points and ask what patterns emerged, what the map failed to show, and what additional information would change the group’s interpretation.",
          "A map is a representation, not the landscape itself. Teaching that distinction helps learners use digital tools with more care and curiosity.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does an outdoor lesson need one phone per student?",
        answer:
          "No. Small groups can share a device, while the educator keeps the primary route and safety plan.",
      },
      {
        question: "What should students avoid mapping?",
        answer:
          "Avoid sensitive locations, personal information, private access details, or anything the program’s policies say should not be recorded or shared.",
      },
    ],
    related: ["conservation-field-data-collection", "offline-field-mapping-guide"],
  },
  {
    slug: "event-course-mapping",
    title: "Event Course Mapping: Plan, Check, and Share Outdoor Routes",
    metaDescription:
      "Plan and inspect outdoor event courses with offline route maps, checkpoint notes, practical field checks, and clear public or private sharing choices.",
    audience: "Race directors and outdoor event organizers",
    published: "2026-08-12",
    readingMinutes: 6,
    intro:
      "A course map should help an event team make better operational decisions before it helps participants admire the route. The first job is to check access, critical turns, checkpoints, and changes discovered in the field.",
    sections: [
      {
        heading: "Build a field-checkable course plan",
        paragraphs: [
          "Import or plot the course, then walk or ride the sections most likely to create confusion. Record turn locations, aid or checkpoint sites, road crossings, and places where signage or staffing matters.",
          "Use notes to capture the reason for a point. A marker named “CP-2” is useful; a note explaining access, parking, or a contingency makes it useful to the next person on the event team.",
        ],
      },
      {
        heading: "Test the route in the conditions that matter",
        paragraphs: [
          "Offline maps should be tested before event day, especially on remote or wooded sections. A recorded inspection route can also show where a planned line differs from what is passable on the ground.",
          "Do not treat a phone route as a safety plan. Use the permits, medical planning, communications, signage, and volunteer procedures appropriate for the event and jurisdiction.",
        ],
      },
      {
        heading: "Choose the right audience for every link",
        paragraphs: [
          "A public course route can be helpful when it contains only information suitable for participants. Operations notes, private access, or contingency routing should remain in a controlled internal handoff.",
          "After a change, update the route deliberately and stop sharing obsolete versions. Clarity is more important than maintaining a collection of old course links.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can event organizers share a route with participants?",
        answer:
          "Yes, when the route contains information appropriate for public viewing. Keep operational and sensitive access details out of public links.",
      },
      {
        question: "Does a route map replace event safety planning?",
        answer:
          "No. A map supports planning and communication; it does not replace permits, staffing, medical, communications, or emergency procedures.",
      },
    ],
    related: ["tour-operator-route-mapping", "trail-maintenance-mapping"],
  },
  {
    slug: "hunting-map-workflows",
    title: "Hunting Map Workflows: Carry Your Own Data Offline",
    metaDescription:
      "Learn a privacy-conscious, offline mapping workflow for carrying your own hunting routes, waypoints, and public land data on a phone.",
    audience: "Hunters using their own map data",
    published: "2026-08-19",
    readingMinutes: 6,
    intro:
      "Many hunters already have the data they need: a GPX route from a prior season, a public agency boundary layer, a parking location, or a set of personal waypoints. The value of a field map is carrying that information offline and keeping personal locations under your control.",
    sections: [
      {
        heading: "Bring your own data, and verify its source",
        paragraphs: [
          "Import GPX, KML, KMZ, or GeoJSON files that you are authorized to use. Agency boundary files and publicly available access information can be helpful context, but always verify current rules, seasons, and access conditions from the responsible agency.",
          "Mapper.one does not include proprietary parcel ownership or hunting-unit datasets. If those data are central to your plan, use the source and service that provides them or import approved public data where appropriate.",
        ],
      },
      {
        heading: "Keep personal waypoints personal",
        paragraphs: [
          "A waypoint can hold a practical observation: a safe parking point, a route decision, a wind note, or a location to revisit. Use notes that make sense to you later without putting sensitive details into a public map link.",
          "Offline preparation matters. Save the map area before entering remote country, keep a power plan, and carry the physical navigation tools required for your trip.",
        ],
      },
      {
        heading: "Use a map responsibly",
        paragraphs: [
          "A mapping app does not confirm property ownership, legal access, wildlife regulations, or safety conditions. Those responsibilities remain with the person in the field.",
          "Share routes carefully. A route that is fine for a trusted partner may expose private access or fragile areas if posted publicly.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does mapper.one include landowner maps?",
        answer:
          "No. It is a bring-your-own-data mapping app. You can import data you are authorized to use, but it does not include proprietary parcel ownership layers.",
      },
      {
        question: "Can I use a phone map as my only navigation tool?",
        answer:
          "No. Carry appropriate backup navigation tools, power, and safety equipment for the trip.",
      },
    ],
    related: ["offline-field-mapping-guide", "caltopo-exports-on-phone"],
  },
  {
    slug: "wildfire-preplanning-maps",
    title: "Wildfire Pre-Planning Maps: A Field Reference, Not an Incident System",
    metaDescription:
      "Use offline mobile maps as a practical wildfire pre-planning field reference for access, observations, and training while respecting operational data controls.",
    audience: "Land managers and fire-preparedness teams",
    published: "2026-08-13",
    readingMinutes: 7,
    intro:
      "Pre-planning walks can surface information that is difficult to understand from a desk: access constraints, road condition changes, water sources, gates, hazards, and communication gaps. A mobile map can keep those observations tied to a location, but it is not an incident-management system.",
    sections: [
      {
        heading: "Prepare a limited, approved field reference",
        paragraphs: [
          "Carry only the layers and details your team is authorized to use: approved access routes, non-sensitive infrastructure references, management boundaries, and pre-planning points. Download the needed map area before the field visit.",
          "Version control matters. Label the source and date of reference data so a crew does not treat an old access route or gate condition as current operational information.",
        ],
      },
      {
        heading: "Record observations for the planning process",
        paragraphs: [
          "Use waypoints for observations that need review: a washed-out road, a narrow turnaround, a dry water source, a hazardous crossing, or a change in access condition. Include a concise note and a photo where policy permits.",
          "Do not assume a single field visit is a complete assessment. Conditions, fuels, access, and weather can change quickly. The map should feed a disciplined pre-planning process rather than become an unofficial source of truth.",
        ],
      },
      {
        heading: "Keep operational details controlled",
        paragraphs: [
          "Wildfire-related access and infrastructure information can be sensitive. Follow agency and landowner policies for storage, sharing, and retention. Do not publish public links that reveal information meant for operational planning.",
          "During an incident, use the authorized incident systems, maps, communications, and command structure. A personal phone map is not a substitute for those tools.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can mapper.one be used as an incident map?",
        answer:
          "No. It is a field reference tool for prepared data and observations. Incident operations should use authorized systems and procedures.",
      },
      {
        question: "What wildfire information should not be shared publicly?",
        answer:
          "Follow agency and landowner policies. Access, infrastructure, and operational planning details often require controlled sharing.",
      },
    ],
    related: ["search-and-rescue-field-mapping", "forestry-field-mapping"],
  },
  {
    slug: "volunteer-trail-crew-mapping",
    title: "Volunteer Trail Crew Mapping: Make Every Workday Easier to Continue",
    metaDescription:
      "Help volunteer trail crews map work locations, document completed repairs, and hand off clear follow-up notes with a simple offline field map.",
    audience: "Volunteer trail organizations",
    published: "2026-08-16",
    readingMinutes: 6,
    intro:
      "Volunteer time is too valuable to spend rediscovering last month’s work. A lightweight map can preserve the route, the locations that still need attention, and the context a new volunteer needs to continue the effort.",
    sections: [
      {
        heading: "Give every crew the same starting point",
        paragraphs: [
          "Share the intended route or load it before the workday. This makes trailheads, turnoffs, and work zones easier to find, especially for new volunteers. Download the map area in advance so the group is not dependent on coverage.",
          "Keep the map approachable. A few clear categories—completed work, needs follow-up, safety concern, and materials—are more useful than a complicated taxonomy nobody remembers.",
        ],
      },
      {
        heading: "Record work with a future crew in mind",
        paragraphs: [
          "A completed repair can still need an inspection after a storm. A problem point can need tools, permission, or a different skill set. Use a waypoint note to describe the condition and the next step, then attach a photo when it will reduce ambiguity.",
          "Avoid using individual volunteers’ private contact details in shared notes. The point is to hand off the work, not to create an informal personal directory.",
        ],
      },
      {
        heading: "Close the loop after the workday",
        paragraphs: [
          "Review the day’s points before everyone leaves. Confirm which items are complete, which belong on the next workday, and which need to be escalated to a land manager or professional.",
          "For a public recap, share a route and general outcome only when appropriate. Sensitive hazards, infrastructure, and access details should remain with the stewardship team.",
        ],
      },
    ],
    faqs: [
      {
        question: "What is the simplest waypoint system for volunteers?",
        answer:
          "Use a few consistent labels such as DONE, FOLLOW-UP, HAZARD, and MATERIALS, then add a short plain-language note.",
      },
      {
        question: "Should trail work maps be public?",
        answer:
          "Only when the information is safe and appropriate for public access. Keep sensitive hazards and access details within the team.",
      },
    ],
    related: ["trail-maintenance-mapping", "land-stewardship-field-mapping"],
  },
  {
    slug: "caltopo-exports-on-phone",
    title: "Carry CalTopo Exports on Your Phone: A Free Field Companion Workflow",
    metaDescription:
      "Export a CalTopo route or boundary as GPX or GeoJSON, carry it offline on your phone, and capture field notes without replacing desktop planning.",
    audience: "CalTopo planners working in the field",
    published: "2026-08-19",
    readingMinutes: 6,
    intro:
      "CalTopo is a powerful planning environment for desktop maps, printed products, and advanced layers. A field day can still benefit from a simpler phone companion: carry the approved route or boundary offline, follow it on the ground, and capture observations that belong in the next planning revision.",
    sections: [
      {
        heading: "Export only what the field team needs",
        paragraphs: [
          "Export the relevant route or data layer from the planning workflow in a portable format such as GPX or GeoJSON, then import it to the phone. Keep a version name and date so the team can tell which plan it is carrying.",
          "Do not try to mirror every desktop layer on a small screen. Field use improves when the map shows the route, the boundaries or points that affect decisions, and enough offline basemap context to navigate.",
        ],
      },
      {
        heading: "Check the plan on the ground",
        paragraphs: [
          "Follow or record the route as appropriate for the assignment. Add waypoints for conditions that change the planning picture: a closed access road, a washed crossing, a useful staging spot, or a location needing a new layer or note.",
          "Mapper.one can provide route-following and offline map context, but it does not replace CalTopo’s desktop analysis, printing, team coordination, or specialized layer stack.",
        ],
      },
      {
        heading: "Return observations to the planning workflow",
        paragraphs: [
          "At the end of the visit, review the recorded track and notes while they are fresh. Move approved observations back into the team’s planning system rather than leaving the phone map as the only record.",
          "This division of labor is useful: plan deeply on the desktop, carry a focused map in the field, then let field observations improve the next plan.",
        ],
      },
    ],
    faqs: [
      {
        question: "Which CalTopo exports work well on a phone?",
        answer:
          "GPX is commonly used for routes, and GeoJSON works well for points, lines, and boundaries. Mapper.one can also import KML and KMZ.",
      },
      {
        question: "Does mapper.one replace CalTopo?",
        answer:
          "No. CalTopo remains the stronger desktop planning and analysis tool. Mapper.one is a lightweight, free phone companion for carrying selected data offline.",
      },
    ],
    related: ["offline-field-mapping-guide", "search-and-rescue-field-mapping"],
  },
  {
    slug: "rock-climbing",
    title: "Rock Climbing Route Mapping: Keep the Approach and the Climb Together",
    metaDescription:
      "Use mapper.one to map climbing approaches, save access notes, and keep photos and route details together offline for the next climbing day.",
    audience: "Rock climbers",
    published: "2026-08-20",
    readingMinutes: 6,
    intro:
      "A climbing day is more than the pitch itself. The approach, the turnoff, the wall, and the small details you notice at the base all become part of the experience you want to remember. A field map keeps those pieces together without requiring a signal at the crag.",
    sections: [
      {
        heading: "Map the approach before the climbing day",
        paragraphs: [
          "Import a GPX, KML, KMZ, or GeoJSON route when you already have an approach track, or record the route as you walk it. Save the map area before leaving coverage so the phone still provides useful context at the trailhead and along the approach.",
          "Keep the first map focused on the information that helps you move through the day: the approach line, junctions, access points, and the locations you are authorized to visit. A simple map is easier to read when you are carrying gear and paying attention to the terrain.",
        ],
        checklist: [
          "Save the approach and surrounding map area before leaving service.",
          "Keep landowner, access, and parking notes tied to the relevant location.",
          "Use a consistent name for each wall, boulder field, or climbing area.",
        ],
      },
      {
        heading: "Put the useful details at the base",
        paragraphs: [
          "Drop a waypoint when a turn, landmark, water source, or access detail is easy to miss. Add a short note and a photo when the visual reference will help the next visit. The goal is not to document every tree; it is to preserve the details that make the approach and return less frustrating.",
          "Keep route names, grades, and descriptions aligned with the guidebook or local source you trust. Mapper.one can hold your personal field notes, but it does not verify route information or replace current access guidance.",
        ],
      },
      {
        heading: "Bring the record back for the next visit",
        paragraphs: [
          "Record the approach or the day’s movement when it helps you remember the route. Afterward, review the track and waypoints while the details are fresh. Add what changed, what was especially useful, and what you would do differently next time.",
          "Share only what is appropriate for the area. Some climbing locations have sensitive access arrangements, fragile habitat, or community norms around publicizing exact details. A private map can be more useful than a public pin when the information should stay with your group.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can mapper.one replace a climbing guidebook?",
        answer:
          "No. It is a personal mapping and field-note companion. Use current guidebooks, local sources, landowner guidance, and established climbing safety practices for route and access information.",
      },
      {
        question: "Can I use a climbing approach map without service?",
        answer:
          "Yes, when the route and map area were prepared before leaving coverage. GPS positioning can still help show your location on the offline map.",
      },
    ],
    related: ["hiking", "offline-field-mapping-guide"],
  },
  {
    slug: "hiking",
    title: "Hiking with a Field Journal Map: Routes, Photos, and Offline Notes",
    metaDescription:
      "Build a personal hiking map with offline routes, photo waypoints, and field notes that help you plan the next walk and remember the last one.",
    audience: "Hikers and walkers",
    published: "2026-08-20",
    readingMinutes: 6,
    intro:
      "The best hiking memories are often tied to small places: a quiet junction, a view that opened suddenly, or the spot where the route changed character. Mapper.one gives those moments a location, so a hike can be both an experience outside and a field journal you can return to.",
    sections: [
      {
        heading: "Plan a route you can carry",
        paragraphs: [
          "Import a route or draw a plan before leaving, then save the map area while you have a connection. Include enough surrounding map for a junction, an alternate way back, and the approach to the trailhead instead of saving only the exact line.",
          "Use your own route history, an approved GPX, or a public route as a starting point. Check current local information separately; a mapped line does not confirm that a trail is open, maintained, or suitable for current conditions.",
        ],
      },
      {
        heading: "Mark the moments worth remembering",
        paragraphs: [
          "Record the walk when you want a trace of where the day actually went. Drop waypoints for viewpoints, water, a memorable turn, or a place you want to find again. A short note paired with a photo is often enough to bring the moment back later.",
          "Use names that make sense when you return months later. “North overlook, late afternoon” tells a better story than an automatically generated coordinate and keeps the map useful as a personal journal.",
        ],
        checklist: [
          "Download the map area and route before the trailhead.",
          "Mark meaningful places instead of turning every observation into a pin.",
          "Review the track and notes at the end of the walk while the day is fresh.",
        ],
      },
      {
        heading: "Share the experience at the right level",
        paragraphs: [
          "A public route can help friends discover a walk, while a private map can keep personal notes, quiet places, or detailed access information within your group. Choose the audience before sharing instead of assuming every waypoint belongs on a public map.",
          "When you share, include the context another person needs to make their own decision. Mapper.one can carry the route and your observations, but it cannot confirm current closures, hazards, weather, or a person’s readiness for the walk.",
        ],
      },
    ],
    faqs: [
      {
        question: "Will a hiking map work when my phone has no signal?",
        answer:
          "Yes, if the route and map area were loaded in advance. The phone can use GPS to show your position without mobile data, but it still needs battery and sensible preparation.",
      },
      {
        question: "Can I share a hiking route with friends?",
        answer:
          "Yes. Keep a route private when it contains personal notes or sensitive access details, or publish an appropriate version for public route discovery.",
      },
    ],
    related: ["rock-climbing", "offline-field-mapping-guide"],
  },
  {
    slug: "skiing-winter-sports",
    title: "Skiing and Winter Sports Mapping: Carry a Clear Record into the Cold",
    metaDescription:
      "Prepare offline ski and winter routes, mark decision points, and keep a personal record of approaches and descents without relying on coverage.",
    audience: "Skiers and winter travelers",
    published: "2026-08-20",
    readingMinutes: 6,
    intro:
      "Winter travel changes the shape of a familiar place. A route may be covered, a junction may look different, and the details you want to remember can disappear under snow. A prepared field map helps carry your own route record into the day without pretending to replace weather, avalanche, or local operating information.",
    sections: [
      {
        heading: "Prepare the winter map before you leave",
        paragraphs: [
          "Import a planned route or save a known track, then cache the surrounding map area while connected. Include approaches, junctions, alternates, and the route back rather than relying on a single line that may be difficult to recognize in changing light or snow cover.",
          "Record the source and date of planning data. A winter map is a reference for your decisions, not proof that a route is open, safe, or appropriate for the current weather and conditions.",
        ],
        checklist: [
          "Carry the route, approach, and return map offline.",
          "Mark junctions and decision points before the day begins.",
          "Check current forecasts, closures, and local safety guidance separately.",
        ],
      },
      {
        heading: "Keep observations tied to the terrain",
        paragraphs: [
          "Use waypoints for a junction that was easy to miss, a viewpoint, a transition, or a place where the route required a decision. Add a short note about what you observed and a photo when it will make the location recognizable on a future visit.",
          "A recorded descent or approach can help you understand how the day unfolded. Treat the track as a memory aid and personal record, not as a recommendation for another person to repeat without their own assessment.",
        ],
      },
      {
        heading: "Review the day while the details are fresh",
        paragraphs: [
          "After returning, look back over the route and name the moments that mattered: where the approach took longer than expected, which turn was easy to miss, or where the view changed the day. That context is what makes a track more useful than a line on a map.",
          "Share selectively. Winter routes can include sensitive conditions, private access, or decisions that depend on skills and equipment. A private map keeps the record useful without turning a personal experience into an unqualified route recommendation.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does an offline route make a winter trip safe?",
        answer:
          "No. It is only a navigation and field-note aid. Continue to use current weather, avalanche, closure, equipment, communication, and local safety information appropriate to the activity.",
      },
      {
        question: "Can I record a ski or winter route without coverage?",
        answer:
          "Yes. Prepare the map first, then GPS can record the route without mobile data. Keep the device warm and maintain your normal battery and navigation plan.",
      },
    ],
    related: ["hiking", "search-and-rescue-field-mapping"],
  },
  {
    slug: "fishing",
    title: "Fishing Access Mapping: Build a Personal Water Journal",
    metaDescription:
      "Create a private fishing map for access points, pools, catches, and water observations, with offline notes that make the next trip easier to plan.",
    audience: "Anglers and fishing partners",
    published: "2026-08-20",
    readingMinutes: 6,
    intro:
      "A good fishing log remembers more than whether the day was successful. It remembers where you entered the water, what the reach looked like, and which details you want to notice when you return. Mapper.one turns those observations into a private map you can carry to the next outing.",
    sections: [
      {
        heading: "Map access before the water is in sight",
        paragraphs: [
          "Save the approach, parking area, launch or bank access, and map area before leaving coverage. Add a note about the source of your access information and confirm permissions, regulations, and current conditions through the appropriate local authority or landowner.",
          "A focused map is easier to use beside the water. Keep the route, access points, and a few useful reference locations visible instead of filling the phone with every possible layer.",
        ],
      },
      {
        heading: "Log the details that make a return worthwhile",
        paragraphs: [
          "Use waypoints for pools, crossings, productive water, a good place to stop, or a location where the bank has changed. Pair a catch or observation with a photo and a short note about the conditions you want to remember.",
          "Keep sensitive locations private by default. A personal water journal can include details that should not be broadcast, and a private map is often the most respectful way to share information with a small group.",
        ],
        checklist: [
          "Record the access route and confirm permissions before the trip.",
          "Use short notes that capture conditions, not just a result.",
          "Keep private spots and personal observations out of public links.",
        ],
      },
      {
        heading: "Let the journal improve the next trip",
        paragraphs: [
          "Review the route and notes after the day, while the sequence is still clear. Separate durable observations from conditions that were specific to one date, water level, season, or weather pattern.",
          "Mapper.one does not provide fishing regulations, guarantee access, or predict where fish will be. Its value is keeping your own observations tied to the water so your next plan starts with experience instead of a blank page.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I keep a fishing map private?",
        answer:
          "Yes. Keep access details, personal notes, and sensitive locations in a private map and only share the information that your group or the public should see.",
      },
      {
        question: "Does mapper.one confirm fishing access or regulations?",
        answer:
          "No. Verify permissions, seasons, licenses, closures, and local rules through the responsible authority or landowner before fishing.",
      },
    ],
    related: ["hiking", "hunting-wildlife"],
  },
  {
    slug: "whitewater-boating",
    title: "Whitewater Route Mapping: Carry the River from Put-In to Take-Out",
    metaDescription:
      "Map whitewater put-ins, take-outs, scouting points, and river notes offline so your personal river record stays connected from launch to take-out.",
    audience: "Whitewater paddlers",
    published: "2026-08-20",
    readingMinutes: 6,
    intro:
      "A river day has a sequence: the access road, the put-in, the lines worth scouting, the take-out, and the details you want to remember between them. Mapper.one gives paddlers a place to organize that sequence and carry their own notes without depending on coverage along the river.",
    sections: [
      {
        heading: "Build the river reference before launch",
        paragraphs: [
          "Import or record the route between the put-in and take-out, then save the surrounding map area before leaving service. Mark access roads, shuttle points, and alternate exits only when you have verified that the information is appropriate to use.",
          "Keep the map focused on the day’s actual plan. A route line does not confirm current water levels, access permission, portage conditions, or whether a rapid is suitable for a particular crew.",
        ],
        checklist: [
          "Save the river corridor, access points, and shuttle map offline.",
          "Mark scouting points and take-out details with clear names.",
          "Check current flow, weather, access, and local river guidance separately.",
        ],
      },
      {
        heading: "Put scouting notes where they belong",
        paragraphs: [
          "Use waypoints for rapids, scout locations, hazards, landmarks, or a take-out that is easy to pass. Add a photo from the bank and a concise note about what the crew should recognize, without treating an old observation as a current condition report.",
          "A recorded route can help you remember the river and compare how different days unfolded. Follow the group’s established safety practices and keep the phone from becoming a distraction on the water.",
        ],
      },
      {
        heading: "Make the river record useful next season",
        paragraphs: [
          "Review the map after the trip and distinguish stable geography from date-specific information such as wood, flow, access, or construction. That separation keeps a personal river journal honest and easier to revisit.",
          "Share selectively with paddling partners or keep the map private. Public route sharing should not imply that a river is open, safe, or appropriate for every paddler.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can mapper.one replace a river guide or safety briefing?",
        answer:
          "No. It is a route and field-note companion. Use current river information, local access guidance, appropriate training, and the group’s established safety practices.",
      },
      {
        question: "Will the river map work without cell service?",
        answer:
          "Yes, when the map area and route are prepared in advance. GPS can still support the map without mobile data, subject to device battery and environmental conditions.",
      },
    ],
    related: ["skiing-winter-sports", "hiking"],
  },
  {
    slug: "historical-tours",
    title: "Historical Tour Mapping: Turn a Walk into a Living Field Guide",
    metaDescription:
      "Create a self-guided historical tour with mapped stops, photos, dates, and context that visitors can follow at their own pace.",
    audience: "History walkers and local historians",
    published: "2026-08-20",
    readingMinutes: 6,
    intro:
      "A historical walk becomes easier to follow when the story has a place to stand. Mapper.one connects each stop to a route, photo, date, and short note so a visitor can move through the landscape while keeping the context close at hand.",
    sections: [
      {
        heading: "Shape the story as a route",
        paragraphs: [
          "Plot the walk through the sites you want visitors to notice, then add enough surrounding map to make the start, transitions, and finish clear. A route can be linear, looped, or organized around a neighborhood, campus, district, or landscape.",
          "Keep the map separate from the source research. Verify names, dates, interpretations, and permissions through archives, local historians, official records, or other sources before publishing them as public tour notes.",
        ],
      },
      {
        heading: "Give every stop a useful sense of place",
        paragraphs: [
          "Drop a waypoint for each stop and attach a short description that answers why it matters. A photo can show a detail visitors might otherwise miss, while a date or source note helps distinguish documented history from a personal interpretation.",
          "Use consistent stop names and numbering so the route is easy to follow. Keep the main map readable, then put longer context in the note rather than turning every label into a paragraph.",
        ],
        checklist: [
          "Give each stop a clear name, number, and location.",
          "Separate verified historical context from personal interpretation.",
          "Check public access, photography, and publication permissions.",
        ],
      },
      {
        heading: "Share a tour that respects the place",
        paragraphs: [
          "Publish the route when the information and access are appropriate for public visitors. For a school group, family, or local organization, a private map can be a better way to test the experience before sharing it more widely.",
          "Review the walk from a visitor’s perspective. The best tour map makes the next stop obvious, gives enough context to care, and leaves room for people to notice the place for themselves.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I use mapper.one for a self-guided walking tour?",
        answer:
          "Yes. Map the route, add waypoints with photos and notes, and share the appropriate version with visitors or keep it private while the tour is being developed.",
      },
      {
        question: "Does mapper.one verify historical information?",
        answer:
          "No. Use reliable local and primary sources, identify uncertainty, and confirm access and publication permissions before presenting information as part of a public tour.",
      },
    ],
    related: ["hiking", "offline-field-mapping-guide"],
  },
  {
    slug: "mountain-biking",
    title: "Mountain Bike Route Mapping: Remember the Ride Beyond the GPS Line",
    metaDescription:
      "Plan and record mountain bike rides, mark hazards and crossings, and keep trail conditions and photos tied to the route for the next ride.",
    audience: "Mountain bikers",
    published: "2026-08-20",
    readingMinutes: 6,
    intro:
      "A ride is more than mileage. It is the connection between trails, the turn that nearly sent you the wrong way, the crossing that deserves attention, and the conditions that shaped the day. Mapper.one keeps those details with the route so your ride history remains useful.",
    sections: [
      {
        heading: "Plan the ride and the way back",
        paragraphs: [
          "Import a GPX route or create a plan that includes trail connections, access roads, and a realistic return. Save the area offline before leaving coverage so the route remains visible when the ride moves beyond service.",
          "Use a public route as a reference, not a guarantee of current trail status. Verify closures, permissions, seasonal restrictions, and local guidance through the responsible land manager or riding organization.",
        ],
      },
      {
        heading: "Mark what another rider would want to know",
        paragraphs: [
          "Record the ride and use waypoints for hazards, crossings, confusing junctions, viewpoints, or a place where conditions changed. Add a photo and a short date-stamped note when it helps distinguish a durable feature from a temporary condition.",
          "Keep the map useful at riding speed. A few clear points are easier to understand later than a dense collection of labels, and a note can hold the detail without crowding the route itself.",
        ],
        checklist: [
          "Save the route, access, and return map before the ride.",
          "Mark junctions, crossings, and hazards with concise notes.",
          "Date condition observations before sharing them with other riders.",
        ],
      },
      {
        heading: "Share the route without overpromising",
        paragraphs: [
          "A public route can help friends find a ride, while a private map is better for personal notes or a route still being tested. If you share, say what you actually observed and when rather than implying that the map confirms today’s conditions.",
          "After the ride, review the track and save the parts that will improve the next outing. Mapper.one carries your experience forward; local trail status and rider judgment still belong in the next plan.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I use a mountain bike route offline?",
        answer:
          "Yes. Prepare the route and map area before leaving coverage. GPS can still show your position without mobile data, but current trail information must be checked separately.",
      },
      {
        question: "Can I share trail condition notes?",
        answer:
          "Yes, when sharing is appropriate. Include the date and describe what you observed, and avoid presenting a personal observation as a current official closure or status.",
      },
    ],
    related: ["hiking", "whitewater-boating"],
  },
  {
    slug: "hunting-wildlife",
    title: "Hunting and Wildlife Observation Mapping: Keep a Quiet Field Journal",
    metaDescription:
      "Keep private hunting and wildlife observation maps for access routes, blinds, sightings, and habitat notes without losing the context of each season.",
    audience: "Hunters and wildlife observers",
    published: "2026-08-20",
    readingMinutes: 7,
    intro:
      "Field observations become more valuable when they can be compared over time. Mapper.one helps keep access routes, observation locations, photos, and habitat notes together in a personal record, while leaving regulations, land access, and wildlife management decisions to the authorities and landowners responsible for them.",
    sections: [
      {
        heading: "Start with authorized access and a private map",
        paragraphs: [
          "Import or record the routes you are permitted to use, then save the surrounding map area before leaving coverage. Mark access points, gates, blinds, or observation areas only when you have permission to carry and store that information.",
          "Keep sensitive locations private by default. Exact wildlife observations, private land details, and personal hunting plans may not be appropriate for public route discovery or broad sharing.",
        ],
        checklist: [
          "Verify land access, seasons, licenses, and local rules before going out.",
          "Download the map and approved routes before leaving service.",
          "Keep sensitive observations and private access details controlled.",
        ],
      },
      {
        heading: "Record observations with enough context",
        paragraphs: [
          "Use a waypoint for a sighting, track, habitat change, water source, or location worth revisiting. Add the date, a concise observation, and a photo when appropriate. Context makes the record more useful than a coordinate alone.",
          "Separate what you saw from what you inferred. Mapper.one can preserve your field journal, but it cannot identify species, confirm population trends, or validate a management conclusion.",
        ],
      },
      {
        heading: "Compare seasons without turning the map into a claim",
        paragraphs: [
          "Review old tracks and notes before a new season to remember access, observation patterns, and questions to revisit. Date your notes so weather, habitat, and seasonal differences stay visible.",
          "Share only within the group and process that should receive the information. Continue to follow current regulations, ethical practices, landowner requests, and wildlife agency guidance; a personal map is a memory and planning aid, not a legal or biological authority.",
        ],
      },
    ],
    faqs: [
      {
        question: "Should hunting and wildlife maps be public?",
        answer:
          "Usually keep sensitive locations, private access details, and personal plans controlled. Share only what is appropriate for the intended audience and consistent with landowner and agency guidance.",
      },
      {
        question: "Does mapper.one provide hunting regulations or wildlife data?",
        answer:
          "No. Verify seasons, licenses, boundaries, access, species information, and current rules with the responsible agency or landowner.",
      },
    ],
    related: ["fishing", "hiking"],
  },
];

const guideBySlug = new Map(guides.map((guide) => [guide.slug, guide]));

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function anchorFor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const USE_CASES_PATH = "/use-cases";

function renderGuideCard(guide: FieldGuide): string {
  return `<a class="guide-card" href="${USE_CASES_PATH}/${escapeHtml(guide.slug)}">
    <span class="guide-audience">${escapeHtml(guide.audience)}</span>
    <h2>${escapeHtml(guide.title)}</h2>
    <p>${escapeHtml(guide.metaDescription)}</p>
    <span class="guide-read">${guide.readingMinutes} min read <span aria-hidden="true">→</span></span>
  </a>`;
}

function renderCommunityCard(post: CommunityFieldNoteSummary): string {
  const meta = [
    post.locationName,
    post.author,
    new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(post.createdAt),
  ]
    .filter(Boolean)
    .map((item) => escapeHtml(item as string))
    .join(' <span aria-hidden="true">·</span> ');
  return `<a class="guide-card community-card" href="/blog/${escapeHtml(post.slug)}">
    <span class="guide-audience">Community field note</span>
    <h2>${escapeHtml(post.title)}</h2>
    <p>${escapeHtml(post.excerpt)}</p>
    <span class="guide-read">${meta}</span>
  </a>`;
}

function guideSchema(guide: FieldGuide, origin: string): object[] {
  const canonical = `${origin}${USE_CASES_PATH}/${guide.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: guide.title,
      description: guide.metaDescription,
      datePublished: guide.published,
      dateModified: guide.published,
      mainEntityOfPage: canonical,
      image: `${origin}${OG_IMAGE_PATH}`,
      author: { "@type": "Organization", name: "mapper.one" },
      publisher: { "@type": "Organization", name: "mapper.one" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Use Cases",
          item: `${origin}${USE_CASES_PATH}`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: guide.title,
          item: canonical,
        },
      ],
    },
  ];
}

export function allGuidePaths(): string[] {
  return [USE_CASES_PATH, ...guides.map((guide) => `${USE_CASES_PATH}/${guide.slug}`)];
}

export function getGuide(slug: string): FieldGuide | undefined {
  return guideBySlug.get(slug);
}

export function getGuideIndexHtml(
  req: Request,
  communityNotes: CommunityFieldNoteSummary[],
): string {
  const origin = originFor(req);
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "mapper.one Use Cases",
      description:
        "Practical mapping guides for field crews, outdoor travelers, and anyone carrying routes and observations beyond coverage.",
      url: `${origin}${USE_CASES_PATH}`,
      hasPart: guides.map((guide) => ({
        "@type": "BlogPosting",
        headline: guide.title,
        url: `${origin}${USE_CASES_PATH}/${guide.slug}`,
      })),
    },
  ];
  const communitySection =
    communityNotes.length > 0
      ? `<section class="guide-community"><div class="wrap">
        <div class="guide-library-head">
          <div><p class="eyebrow">From the mapper.one community</p><h2>Route stories from the field.</h2></div>
          <p>Published track stories, route details, and observations created by mapper.one users.</p>
        </div>
        <div class="guide-grid">${communityNotes.map(renderCommunityCard).join("")}</div>
      </div></section>`
      : "";
  const body = `<section class="guide-hero"><div class="wrap narrow">
    <p class="eyebrow">mapper.one use cases</p>
    <h1>Practical mapping use cases for work and time outside.</h1>
    <p class="lead">Clear, no-hype workflows for carrying maps offline, remembering a day outdoors, documenting observations, and handing useful information to the next person.</p>
  </div></section>
  <section class="guide-library"><div class="wrap">
    <div class="guide-library-head">
       <div><p class="eyebrow">${guides.length} practical use cases</p><h2>Find the workflow that fits your field day.</h2></div>
      <p>Built for people who carry their own routes, boundaries, and observations into the places where signal is unreliable.</p>
    </div>
    <div class="guide-grid">${guides.map(renderGuideCard).join("")}</div>
  </div></section>${communitySection}
  ${ctaBand(
    "Carry the map, not the uncertainty.",
    "Import the data you already use, save your map area offline, and keep practical notes tied to the places where they matter.",
  )}`;

  return renderShell({
    title: "Field and Outdoor Mapping Use Cases | mapper.one",
    description:
      "Practical mapping guides for field crews, outdoor travelers, and anyone carrying routes and observations beyond cell coverage.",
    canonical: `${origin}${USE_CASES_PATH}`,
    ogImage: `${origin}${OG_IMAGE_PATH}`,
    activeNav: USE_CASES_PATH,
    schema,
    body,
  });
}

export function getGuideHtml(req: Request, slug: string): string | null {
  const guide = getGuide(slug);
  if (!guide) return null;

  const origin = originFor(req);
  const canonical = `${origin}${USE_CASES_PATH}/${guide.slug}`;
  const toc = guide.sections
    .map(
      (section) =>
        `<li><a href="#${anchorFor(section.heading)}">${escapeHtml(section.heading)}</a></li>`,
    )
    .join("");
  const sections = guide.sections
    .map((section) => {
      const paragraphs = section.paragraphs
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");
      const checklist = section.checklist
        ? `<ul class="guide-checklist">${section.checklist
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")}</ul>`
        : "";
      return `<section id="${anchorFor(section.heading)}" class="guide-section">
        <h2>${escapeHtml(section.heading)}</h2>${paragraphs}${checklist}
      </section>`;
    })
    .join("");
  const faqs = guide.faqs
    .map(
      (faq) => `<details class="guide-faq"><summary>${escapeHtml(
        faq.question,
      )}</summary><p>${escapeHtml(faq.answer)}</p></details>`,
    )
    .join("");
  const related = guide.related
    .map((relatedSlug) => guideBySlug.get(relatedSlug))
    .filter((item): item is FieldGuide => Boolean(item))
    .map(renderGuideCard)
    .join("");
  const body = `<article class="guide-article">
    <header class="guide-article-hero"><div class="wrap narrow">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="${USE_CASES_PATH}">Use Cases</a> <span aria-hidden="true">/</span> ${escapeHtml(guide.audience)}</nav>
      <p class="eyebrow">${escapeHtml(guide.audience)}</p>
      <h1>${escapeHtml(guide.title)}</h1>
      <p class="lead">${escapeHtml(guide.intro)}</p>
      <p class="guide-meta">By mapper.one <span aria-hidden="true">·</span> ${dateLabel(guide.published)} <span aria-hidden="true">·</span> ${guide.readingMinutes} min read</p>
    </div></header>
    <div class="wrap guide-content-layout">
      <aside class="guide-toc"><p class="eyebrow">In this guide</p><ol>${toc}</ol></aside>
      <div class="guide-prose">${sections}
        <section class="guide-section guide-faqs"><p class="eyebrow">Common questions</p><h2>Questions from the field</h2>${faqs}</section>
      </div>
    </div>
    <section class="guide-related"><div class="wrap">
      <p class="eyebrow">Keep reading</p><h2>Related use cases</h2>
      <div class="guide-grid guide-grid-small">${related}</div>
    </div></section>
  </article>
  ${ctaBand(
    "Make your next field day easier to hand off.",
    "Map the places where you work. Carry your own data, work offline, and record the details that matter.",
  )}`;

  return renderShell({
    title: `${guide.title} | mapper.one`,
    description: guide.metaDescription,
    canonical,
    ogImage: `${origin}${OG_IMAGE_PATH}`,
    ogType: "article",
    activeNav: USE_CASES_PATH,
    schema: guideSchema(guide, origin),
    body,
  });
}

export function getCommunityPostHtml(
  req: Request,
  post: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    coverImageUrl: string | null;
    author: string | null;
    locationName: string | null;
    createdAt: Date;
  },
): string {
  const origin = originFor(req);
  const canonical = `${origin}/blog/${post.slug}`;
  const content = post.content
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => {
      const trimmed = block.trim();
      if (trimmed.startsWith("## ")) {
        return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      }
      if (trimmed.startsWith("# ")) {
        return `<h2>${escapeHtml(trimmed.slice(2))}</h2>`;
      }
      return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
  const image = post.coverImageUrl
    ? `<figure class="guide-cover"><img src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.title)}" width="1200" height="675" /><figcaption>Community field note</figcaption></figure>`
    : "";
  const meta = [
    post.author ? escapeHtml(post.author) : "mapper.one community",
    post.locationName ? escapeHtml(post.locationName) : null,
    new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(post.createdAt),
  ]
    .filter(Boolean)
    .join(' <span aria-hidden="true">·</span> ');
  const body = `<article class="guide-article">
    <header class="guide-article-hero"><div class="wrap narrow">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/blog">Field Notes</a> <span aria-hidden="true">/</span> Community Field Note</nav>
      <p class="eyebrow">Community field note</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="lead">${escapeHtml(post.excerpt)}</p>
      <p class="guide-meta">${meta}</p>
    </div></header>
    <div class="wrap narrow guide-prose">${image}${content}</div>
  </article>
  ${ctaBand(
    "Map the places where you work.",
    "Carry your own data offline, record your route, and keep practical field notes connected to place.",
  )}`;
  return renderShell({
    title: `${post.title} | mapper.one Field Notes`,
    description: post.excerpt,
    canonical,
    ogImage: post.coverImageUrl ?? `${origin}${OG_IMAGE_PATH}`,
    ogType: "article",
    activeNav: "/blog",
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.excerpt,
        datePublished: post.createdAt.toISOString(),
        mainEntityOfPage: canonical,
        image: post.coverImageUrl ?? `${origin}${OG_IMAGE_PATH}`,
        author: { "@type": "Organization", name: post.author ?? "mapper.one community" },
        publisher: { "@type": "Organization", name: "mapper.one" },
      },
    ],
    body,
  });
}