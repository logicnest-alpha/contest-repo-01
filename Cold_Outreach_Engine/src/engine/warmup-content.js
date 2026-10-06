// Natural-looking warmup conversations. Plain text, no links, no tracking, no spam words:
// they should look like ordinary work email between colleagues.
const { pick, randInt } = require('../util');

const TOPICS = [
  {
    subjects: ['Notes from today', 'Quick recap', 'Follow-up on our call', 'Recap + next steps'],
    lines: [
      'Thanks for the time earlier. I wrote down the main points so we are on the same page.',
      'Here is a short summary of what we discussed this morning.',
      'Putting the notes from our chat in one place before I forget the details.',
    ],
    details: [
      'We agreed to keep the scope small for the first phase and review it again in two weeks.',
      'The main open item is the timeline for the second milestone.',
      'I will share the updated plan once the team has had a look at it.',
      'Let me know if I missed anything important from your side.',
    ],
  },
  {
    subjects: ['Meeting next week', 'Can we move Thursday?', 'Time for a quick sync', 'Scheduling'],
    lines: [
      'Would it be possible to find 30 minutes next week to go through the plan?',
      'Something came up on Thursday afternoon. Could we move our sync to Friday morning?',
      'I would like to catch up briefly before the end of the month.',
    ],
    details: [
      'Tuesday or Wednesday after lunch works best for me.',
      'Any time before noon is fine on my side.',
      'If the afternoon is easier for you, that works too.',
      'Happy to keep it short, 20 minutes should be enough.',
    ],
  },
  {
    subjects: ['Question about the report', 'Numbers for this month', 'Small question', 'Checking one detail'],
    lines: [
      'I was going through the monthly report and had a small question about the second section.',
      'Do you have the latest figures for this month handy?',
      'Quick one: which version of the document should I be working from?',
    ],
    details: [
      'No rush, whenever you get a moment is fine.',
      'I just want to make sure we are using the same numbers in the summary.',
      'If it is easier, we can go through it on a short call.',
      'I can also check with the rest of the team if you are busy this week.',
    ],
  },
  {
    subjects: ['Draft for review', 'Feedback on the draft', 'First version ready', 'Can you take a look?'],
    lines: [
      'I have finished the first version of the proposal and would value your thoughts.',
      'The draft is mostly done. Could you have a look at the structure when you have time?',
      'I made the changes we talked about. Let me know what you think.',
    ],
    details: [
      'The introduction is still a bit long, so any suggestions there are welcome.',
      'I kept the pricing section open until we confirm the details.',
      'The goal is to send it out by the end of next week.',
      'Comments on anything are welcome, even small ones.',
    ],
  },
  {
    subjects: ['Thanks again', 'Good to meet you', 'Great conversation', 'Following up'],
    lines: [
      'It was good to meet you at the event last week.',
      'Thanks again for the introduction, it was really helpful.',
      'I enjoyed our conversation and wanted to follow up as promised.',
    ],
    details: [
      'I would be glad to stay in touch and share notes from time to time.',
      'Let me know if there is anything I can help with on your side.',
      'I will reach out again once we have the next update ready.',
      'Hope the rest of your week goes well.',
    ],
  },
  {
    subjects: ['Plan for the quarter', 'Priorities for next month', 'Team update', 'Project update'],
    lines: [
      'Sharing a short update on where we are with the project.',
      'We are wrapping up the current phase and planning the next steps.',
      'A quick update on the priorities we discussed for next month.',
    ],
    details: [
      'Most of the groundwork is done and the next step is testing with a small group.',
      'We had a few delays last week but things are back on track now.',
      'The team is focusing on the two items we marked as most important.',
      'I will send a fuller update after our review meeting.',
    ],
  },
];

const GREETINGS = ['Hi {name},', 'Hello {name},', 'Hey {name},', 'Hi {name}', '{name},', 'Good morning {name},'];
const CLOSINGS = ['Thanks,', 'Best,', 'Regards,', 'Cheers,', 'Thank you,', 'Best regards,', 'Talk soon,'];
const QUESTIONS = [
  'Does that work for you?', 'What do you think?', 'Let me know your thoughts.',
  'Would that be okay?', 'Any thoughts on this?', 'Let me know if that makes sense.',
];

const REPLIES = [
  'Thanks for sending this over. That works for me.',
  'Sounds good, thank you for the update.',
  'Got it, thanks. I will take a look and get back to you.',
  'Thanks, this is helpful. Let us go with that.',
  'Appreciate the note. Friday morning works on my side.',
  'Thank you. I will check with the team and confirm tomorrow.',
  'Perfect, that helps a lot. Talk soon.',
  'Thanks for the summary, nothing to add from my side.',
  'Great, thanks for following up on this.',
  'That makes sense. I will share my comments by Thursday.',
];
const REPLY_EXTRAS = [
  '', '', '',
  'One small thing: could you also add the dates to the plan?',
  'I will be travelling on Monday, so Tuesday onwards is easier.',
  'Let me know if you need anything else from me.',
  'Looking forward to the next update.',
];

function firstName(fromName, email) {
  const n = String(fromName || '').trim().split(/\s+/)[0];
  if (n) return n;
  const local = String(email || '').split('@')[0].split(/[._-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
}

function newConversation(sender, receiver) {
  const topic = pick(TOPICS);
  const name = firstName(receiver.from_name, receiver.email);
  const me = firstName(sender.from_name, sender.email);
  const body = [
    pick(GREETINGS).replace('{name}', name),
    '',
    pick(topic.lines),
    randInt(0, 1) ? pick(topic.details) : `${pick(topic.details)} ${pick(topic.details)}`,
    '',
    pick(QUESTIONS),
    '',
    pick(CLOSINGS),
    me,
  ].join('\n');
  return { subject: pick(topic.subjects), body };
}

function reply(sender, receiver, previousBody) {
  const name = firstName(receiver.from_name, receiver.email);
  const me = firstName(sender.from_name, sender.email);
  const extra = pick(REPLY_EXTRAS);
  const quoted = String(previousBody || '').split('\n').slice(0, 12).map((l) => `> ${l}`).join('\n');
  const body = [
    pick(GREETINGS).replace('{name}', name),
    '',
    pick(REPLIES) + (extra ? ` ${extra}` : ''),
    '',
    pick(CLOSINGS),
    me,
    '',
    `On ${new Date().toUTCString()}, ${receiver.email} wrote:`,
    quoted,
  ].join('\n');
  return { body };
}

module.exports = { newConversation, reply };
