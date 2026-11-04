export type Guide = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
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
          'Use the sidebar groups (Overview, Communicate, Work, People & customers, Business) to open an app. Click a group heading to collapse it.',
          'When an app is open, its pages appear indented underneath it. Click one to jump straight there.',
          'Every page you visit stays open as a tab under the breadcrumb. Click a tab to return to it and the x to close it.',
          'Use the search bar at the top of the sidebar to find channels, messages, people, events and records.',
          'Use the arrow button at the top of the sidebar to shrink it to icons.',
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
    title: 'Projects, tasks & Drive',
    description: 'Plan work and keep files together.',
    guides: [
      {
        id: 'projects',
        title: 'Projects',
        summary: 'Each project has its own page for notes, files, a time log and activity.',
        steps: [
          'Open Projects & Tasks, switch to Projects and choose New project.',
          'Open a project to add tasks, notes, pictures and time entries.',
          'The activity log records what changed and who did it.',
        ],
      },
      {
        id: 'tasks',
        title: 'Tasks',
        summary: 'Tasks can belong to a project or stand alone.',
        steps: [
          'Open Projects & Tasks, switch to Tasks and add a task. Assign it, set a due date and a priority.',
          'Leave the project empty to keep it as a standalone task.',
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
        title: 'Customers (CRM & support)',
        summary: 'Contacts, organizations and every interaction with them.',
        steps: [
          'Open Customers and use Contacts or Organizations to add people and groups.',
          'Log calls, emails and meetings under Interactions.',
          'Funders added through Grants appear here automatically.',
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
      {
        id: 'marketing',
        title: 'Marketing',
        summary: 'Campaigns, content calendar, communications, brand and partnerships.',
        steps: [
          'Open Marketing and pick a page from the sidebar.',
          'Use the content calendar to plan what is published and when.',
        ],
      },
    ],
  },
  {
    id: 'business',
    title: 'Grants & legal',
    description: 'Fund the mission and stay compliant.',
    guides: [
      {
        id: 'grants',
        title: 'Tracking grants',
        summary: 'Money and product grants from first idea through reporting.',
        steps: [
          'Open Grants and choose Add grant, or import grants you have already won from a CSV exported from Google Sheets.',
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
          'Open Grants > Resources and fill in the Organization summary. The AI uses it for research.',
          'Open Find Grants and run a research request.',
          'Review each suggestion and add the good ones to your list.',
        ],
        tips: ['The better your organization summary, the better the suggestions.'],
      },
      {
        id: 'legal',
        title: 'Legal',
        summary: 'Contracts, compliance, risk, policies and legal records.',
        steps: [
          'Open Legal (visible to people with access) and choose a page.',
          'Store contracts and track compliance items with their due dates.',
        ],
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
