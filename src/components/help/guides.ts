export type Guide = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
  faqs?: { q: string; a: string }[];
};

export type GuideSection = {
  id: string;
  title: string;
  description: string;
  guides: Guide[];
};

export const guideSections: GuideSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    description: 'Find your way around Flown.',
    guides: [
      {
        id: 'navigate',
        title: 'Navigating the workspace',
        summary: 'The sidebar on the left holds every app. The top bar shows where you are and keeps your open pages as tabs.',
        steps: [
          'Flown is dark-mode only. The sidebar collapses automatically when you open a page; use the Menu button at the top left of the top bar to bring it back. It hides itself again on the next page.',
          'Use the sidebar groups (Overview, Communicate, Work, Customers, Products, Company) to open an app. Click a group heading to collapse it.',
          'Every page you visit stays open as a tab in the top bar. Click a tab to return to it and the x to close it.',
          'Use the search bar to find channels, messages, people, events and records.',
          'Quick Add in the top bar starts a new message, email, channel or event. The AI button opens the workspace assistant; the bell shows notifications.',
        ],
        faqs: [
          { q: 'Where did the sidebar go?', a: 'It auto-hides to give pages more room. Click Menu at the top left of the top bar to show it.' },
          { q: 'Can I switch to light mode?', a: 'No. Flown is dark-mode only. You can change the accent color in Settings > Appearance.' },
        ],
        tips: ['Quick add (top right) starts a new chat, email, channel or event from anywhere.'],
      },
      {
        id: 'profile',
        title: 'Your profile and status',
        summary: 'Let teammates know who you are and whether you are available.',
        steps: [
          'Click your avatar at the bottom of the sidebar.',
          'Pick a status and type a short status message, then save.',
          'Choose Edit profile to change your photo, name, title and other details.',
          'Open Settings (gear icon next to your name) for notification, theme and workspace preferences.',
        ],
      },
      {
        id: 'notifications',
        title: 'Notifications',
        summary: 'The bell in the top bar collects mentions, replies, invites and reminders.',
        steps: [
          'Click the bell to open your notifications.',
          'Click a notification to jump to the item it refers to.',
          'Use the mark-as-read options to clear the badge.',
        ],
      },
    ],
  },
  {
    id: 'communicate',
    title: 'Messages, channels, email & calendar',
    description: 'Talk to your team and manage your time.',
    guides: [
      {
        id: 'messages',
        title: 'Direct messages and group chats',
        summary: 'Private conversations with one or more teammates.',
        steps: [
          'Open Messages, or choose Quick add > New chat.',
          'Pick one or more teammates and write your message.',
          'Reply in a thread to keep side conversations tidy.',
          'Start a voice or video call from the conversation header.',
        ],
      },
      {
        id: 'channels',
        title: 'Channels',
        summary: 'Shared spaces for a team, project or topic.',
        steps: [
          'Open Messages and pick a channel from the Channels list, or use the + next to Channels to create one.',
          'If you do not have permission to post in a channel, a short notice appears where the composer would be.',
          'Mention people with @ so they are notified.',
        ],
      },
      {
        id: 'email',
        title: 'Email',
        summary: 'Connect a mailbox and read, reply to and send email without leaving Flown.',
        steps: [
          'Open Email and connect your mailbox when prompted. Mail syncs automatically when you open the page.',
          'Replies you send appear in the conversation chain as well as in Sent.',
          'Use Quick add > New email to compose from anywhere.',
          'Schedule a send time from the composer if you want a message to go out later.',
        ],
        tips: ['If mail looks out of date, reopen the Email page to trigger a fresh sync.'],
      },
      {
        id: 'calendar',
        title: 'Calendar',
        summary: 'See your events and add new ones.',
        steps: [
          'Open Calendar to see your schedule.',
          'Use Quick add > New event, or click a day, to create an event.',
          'Add attendees and a location so everyone has the details.',
        ],
      },
    ],
  },
  {
    id: 'work',
    title: 'Tasks & Drive',
    description: 'Plan work and keep files together.',
    guides: [
      {
        id: 'tasks',
        title: 'Tasks',
        summary: 'Every task in one place, including tasks created inside Software, Mechanical, Electrical and Systems projects.',
        steps: [
          'Open Tasks and add a task. Assign it, set a due date and a priority.',
          'Pick an engineering project to link it, or leave it empty for a standalone task. Filter by project, status or Assigned to me.',
          'Open a task to add comments, files and a time log.',
        ],
      },
      {
        id: 'drive',
        title: 'Drive, documents, sheets and slides',
        summary: 'Create and store documents with the built-in editors.',
        steps: [
          'Open Drive and use New to create a document, spreadsheet, presentation or form.',
          'Upload existing files with the upload button, or drag them in.',
          'Use the left-hand views to filter by file type.',
          'Share a file from its menu to give teammates access.',
        ],
      },
    ],
  },
  {
    id: 'people',
    title: 'Customers & support',
    description: 'Contacts, customers and support.',
    guides: [
      {
        id: 'relationships',
        title: 'Customers: companies, contacts & support',
        summary: 'Companies (funders and partners), contacts, and customer support.',
        steps: [
          'Open Customers > Companies to add the organizations you work with, such as funders and partners.',
          'Use Contacts to keep people and their details. Customers are reserved for the people you actually serve.',
          'Use Support for customer conversations and tickets.',
        ],
      },
      {
        id: 'support',
        title: 'Customer support',
        summary: 'Answer customers who write in through the public chat page or by email. Available to admins and coordinators.',
        steps: [
          'Open Support > Customer messages. Open conversations appear in the list on the left.',
          'Reply by chat or email, or add an internal note that only staff can see.',
          'Use Suggest reply for an AI draft and Generate for a conversation summary. Always review before sending.',
          'Share the customer chat link at /contact on your site with customers.',
          'Use the Tickets tab for formal support requests.',
        ],
      },
    ],
  },
  {
    id: 'business',
    title: 'Company',
    description: 'Ideas, grants, content and company documents.',
    guides: [
      {
        id: 'ideas',
        title: 'Ideas',
        summary: 'A company-wide board for ideas on brand, grants, product, marketing and more.',
        steps: [
          'Open Company > Ideas and choose New idea.',
          'Pick a category, then upvote ideas you want to see happen.',
          'The idea owner or an admin can update its status as it moves from New to Done.',
        ],
      },
      {
        id: 'content-calendar',
        title: 'Content calendar',
        summary: 'Plan what is published and when.',
        steps: [
          'Open Company > Content Calendar and add a post to a day.',
          'Send it for approval, then schedule or publish it.',
        ],
      },
      {
        id: 'grants',
        title: 'Tracking grants',
        summary: 'Money and product grants from first idea through reporting.',
        steps: [
          'Open Company > Grants and choose Add grant, or import grants you have already won from a CSV exported from Google Sheets.',
          'Move a grant through Prospect, Applied, Awarded, Reporting and Closed as it progresses.',
          'Open a grant to see its overview, activity and files & reports. Add a funder name and it is created in Customers for you.',
          'Upcoming deadlines show at the top of the Grants page.',
        ],
      },
      {
        id: 'find-grants',
        title: 'Finding grants with AI',
        summary: 'Let the AI suggest grants that fit your organization.',
        steps: [
          'Open Company > Grant Resources and fill in the Organization summary. The AI uses it for research.',
          'Open Company > Find Grants and run a research request.',
          'Review each suggestion and add the good ones to your list.',
        ],
        tips: ['The better your organization summary, the better the suggestions.'],
      },
      {
        id: 'website',
        title: 'Website content',
        summary: 'Manage policy and support content, and link your website analytics dashboard.',
        steps: [
          'Open Company > Website to set the public site URL and analytics dashboard link.',
          'Use Policies or Support documents to create and revise public-facing content.',
          'Published content is readable from Supabase; the external site must be connected to this content source to display changes.',
        ],
      },
      {
        id: 'contracts',
        title: 'Customer contracts',
        summary: 'Track agreement terms, files, signature handoff, renewals and end dates.',
        steps: [
          'Open Customers > Contracts and create an agreement linked to a company or contact.',
          'Upload the agreement and amendments to its private file area; use Prepare signature email to open a message draft.',
          'After sending the email from your mail client, mark the request sent. Upload the returned signed copy before marking the contract active.',
          'Update renewal dates and terms in the contract editor, or end the contract when it is no longer in force.',
        ],
        tips: ['Flown stores files and tracks the signature handoff but does not send email or provide a certified e-signature service.'],
      },
    ],
  },
  {
    id: 'insights',
    title: 'Insights & systems',
    description: 'Reports and administration.',
    guides: [
      {
        id: 'insights',
        title: 'Insights',
        summary: 'Dashboards across projects, grants and activity.',
        steps: [
          'Open Insights and pick Executive Overview, Projects & Tasks, Financial Reports, Departments or Activity & Usage.',
        ],
      },
      {
        id: 'systems',
        title: 'Systems (admins)',
        summary: 'Manage users, roles and access to apps.',
        steps: [
          'Open Systems, available to administrators.',
          'Invite teammates and set which apps each role can use.',
        ],
      },
    ],
  },
  {
    id: 'engineering',
    title: 'Products (engineering)',
    description: 'Software, mechanical, electrical, systems and review work in one place.',
    guides: [
      {
        id: 'eng-overview',
        title: 'Engineering projects',
        summary: 'Create a project under Software, Mechanical, Electrical or Systems and keep it moving.',
        steps: [
          'Open Products and choose a discipline, then New project. Set an owner, start and target dates.',
          'Inside a project use Log to post updates, decisions, issues and milestones.',
          'Use Tasks to create work for the project. These tasks also appear on the main Tasks page.',
          'Use Files to upload 3D models (STL, STEP, 3MF), PCB packages, code archives and documents up to 50 MB.',
          'Use Reviews to request a CAD, PCB, code, design, safety or release review.',
        ],
        faqs: [{ q: 'Where do project tasks show up?', a: 'On the Tasks page under Overview. Use the project filter to narrow them.' }],
      },
      {
        id: 'eng-review',
        title: 'Requesting and doing reviews',
        summary: 'Submit work for review and let the review team approve, request changes or reject.',
        steps: [
          'In a project, open Reviews and choose Request review. Pick the type, attach a file, say what you need (for example 3D printing or machining) and add notes.',
          'The review team for that discipline sees it on the Review page with the file, notes and project details.',
          'Reviewers vote Approve, Request changes or Reject and leave a comment.',
          'Once at least two reviewers have voted, the submitter, project owner or an admin records the final outcome, such as Approved for 3D printing or Approved for machining.',
          'Admins choose who is on the review team for each discipline at the top of the Review page.',
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Settings & mobile',
    description: 'Personalize Flown and use it on your phone.',
    guides: [
      {
        id: 'settings',
        title: 'Settings',
        summary: 'Profile, accent color, notifications, security and, for admins, workspace administration.',
        steps: [
          'Open your profile menu at the bottom of the sidebar, then Settings.',
          'Change your accent color under Appearance.',
          'Admins see extra sections for users, roles, departments and positions, and access control.',
        ],
      },
      {
        id: 'mobile',
        title: 'Using Flown on mobile',
        summary: 'The interface adapts to phones with a bottom tab bar and a slide-in menu.',
        steps: [
          'Use the bottom tab bar to switch between pages of the current app.',
          'Tap the menu button in the top bar to open the full navigation drawer.',
          'Tables turn into cards and dialogs fill the screen so everything stays tappable.',
        ],
      },
    ],
  },
  {
    id: 'help',
    title: 'Getting help',
    description: 'When something is wrong or missing.',
    guides: [
      {
        id: 'requests',
        title: 'Reporting a bug or asking for help',
        summary: 'Send the support team a request from the Help Center.',
        steps: [
          'Open Help Center > Submit a request and pick the type: bug, help, feature request or access.',
          'Describe what you expected and what happened. For bugs, list the steps to reproduce.',
          'Track the reply under My requests. The support team may forward it to an administrator when needed.',
        ],
      },
    ],
  },
];
