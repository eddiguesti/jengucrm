# TODO 5: UI/UX - All Pages & Buttons - Complete Audit

**Priority: HIGH** 🟡
**Estimated Time: 3-4 hours**

---

## 🎨 A. Global UI Components

### 1. Layout & Navigation
- [ ] **Sidebar** (`src/components/layout/sidebar.tsx`)
  - [ ] Loads without errors
  - [ ] All menu items display
  - [ ] Icons load correctly
  - [ ] Active state highlights current page
  - [ ] Click each menu item:
    - [ ] Dashboard (/)
    - [ ] Prospects (/prospects)
    - [ ] Campaigns (/outreach/campaigns)
    - [ ] Emails (/emails)
    - [ ] Agents (/agents)
    - [ ] Analytics (/analytics)
    - [ ] Enrichment (/enrichment)
    - [ ] Sales Navigator (/sales-navigator)
    - [ ] Mystery Shopper (/mystery-shopper)
    - [ ] Settings (/settings)

- [ ] **Mobile Navigation** (`src/components/layout/mobile-nav.tsx`)
  - [ ] Hamburger menu works
  - [ ] Menu opens/closes smoothly
  - [ ] All links work on mobile
  - [ ] Proper z-index (doesn't hide behind content)

- [ ] **Header** (`src/components/layout/header.tsx`)
  - [ ] Title displays correctly on each page
  - [ ] Subtitle shows when provided
  - [ ] Action buttons render
  - [ ] Responsive on mobile

### 2. Theme System
- [ ] **Dark/Light Mode Toggle**
  - [ ] Find toggle (usually in header/sidebar)
  - [ ] Switch to light mode
  - [ ] Verify all pages readable
  - [ ] Switch to dark mode
  - [ ] Check contrast ratios
  - [ ] Verify theme persists on refresh

- [ ] **Colors & Styling**
  - [ ] Primary color consistent
  - [ ] Secondary colors appropriate
  - [ ] Text readable on all backgrounds
  - [ ] Links distinguishable
  - [ ] Buttons have proper hover states

### 3. Command Palette
- [ ] **Keyboard Shortcut** (`Cmd+K` or `Ctrl+K`)
  - [ ] Opens command palette
  - [ ] Search works
  - [ ] Navigation shortcuts listed
  - [ ] Execute actions from palette

---

## 🏠 B. Dashboard / Home Page (`/`)

### 1. Page Load
- [ ] Navigate to `/`
- [ ] Page loads without errors
- [ ] No console errors in browser dev tools
- [ ] Loading states display properly
- [ ] Data populates

### 2. Stats Cards
- [ ] **Total Prospects Card**
  - [ ] Number displays
  - [ ] Click navigates to /prospects
  - [ ] Hover effect works

- [ ] **Emails Sent Card**
  - [ ] Count accurate
  - [ ] Click navigates to /emails

- [ ] **Reply Rate Card**
  - [ ] Percentage calculated correctly
  - [ ] Trend indicator (if exists)

- [ ] **Meetings Booked Card**
  - [ ] Count displays

### 3. Charts/Graphs
- [ ] **Email Volume Chart**
  - [ ] Data loads
  - [ ] Correct date range
  - [ ] Hover shows tooltips
  - [ ] Responsive on mobile

- [ ] **Prospect Funnel**
  - [ ] Stages displayed
  - [ ] Counts accurate
  - [ ] Visual makes sense

### 4. Recent Activity Feed
- [ ] Lists recent activities
- [ ] Sorted by date (newest first)
- [ ] Click activity for details
- [ ] Pagination works
- [ ] "Load More" button (if exists)

---

## 👥 C. Prospects Page (`/prospects`)

### 1. Prospect List
- [ ] **Table/Card View**
  - [ ] All prospects display
  - [ ] Columns:
    - [ ] Company name
    - [ ] Contact name
    - [ ] Email
    - [ ] Location
    - [ ] Stage
    - [ ] Tier
    - [ ] Actions
  - [ ] Data accurate

- [ ] **Pagination**
  - [ ] Page numbers display
  - [ ] Next/Previous buttons work
  - [ ] Jump to page works
  - [ ] Shows total count

### 2. Search & Filters
- [ ] **Search Bar**
  - [ ] Type company name → filters list
  - [ ] Type email → filters list
  - [ ] Clear search works

- [ ] **Stage Filter**
  - [ ] Dropdown lists all stages
  - [ ] Select stage → filters list
  - [ ] Multi-select works (if supported)

- [ ] **Tier Filter**
  - [ ] Hot/Warm/Cold options
  - [ ] Filter applies correctly

- [ ] **Location Filter**
  - [ ] Lists unique locations
  - [ ] Filter works

- [ ] **Has Email Filter**
  - [ ] Toggle "With Email Only"
  - [ ] Shows only prospects with emails

### 3. Bulk Actions
- [ ] **Select Multiple Prospects**
  - [ ] Checkboxes work
  - [ ] "Select All" works
  - [ ] Count selected displayed

- [ ] **Bulk Actions Menu**
  - [ ] Add to Campaign
  - [ ] Change Stage
  - [ ] Change Tier
  - [ ] Export CSV
  - [ ] Delete (with confirmation)

### 4. Prospect Detail View
- [ ] **Click Prospect Row**
  - [ ] Opens detail drawer/modal
  - [ ] Or navigates to `/prospects/[id]`

- [ ] **Prospect Details Display**:
  - [ ] Company name, location
  - [ ] Contact name, email, phone
  - [ ] Website (clickable link)
  - [ ] Stage, tier
  - [ ] Pain signals
  - [ ] Notes
  - [ ] Activity history
  - [ ] Email history

- [ ] **Action Buttons**:
  - [ ] Send Email
  - [ ] Add to Campaign
  - [ ] Edit Prospect
  - [ ] Delete Prospect
  - [ ] Add Note

### 5. Add/Edit Prospect
- [ ] **Click "Add Prospect" Button**
  - [ ] Modal/form opens
  - [ ] All fields present
  - [ ] Validation works
  - [ ] Submit creates prospect
  - [ ] Redirects or refreshes list

- [ ] **Edit Prospect**
  - [ ] Click edit icon
  - [ ] Form pre-filled
  - [ ] Update works
  - [ ] Changes saved

---

## 📧 D. Emails Page (`/emails`)

### 1. Email List
- [ ] **Table View**
  - [ ] From address
  - [ ] To address
  - [ ] Subject
  - [ ] Status (sent/opened/replied/bounced)
  - [ ] Date
  - [ ] Actions

- [ ] **Filters**
  - [ ] By direction (inbound/outbound)
  - [ ] By status
  - [ ] By date range
  - [ ] By mailbox
  - [ ] Search subject/body

### 2. Email Detail
- [ ] **Click Email Row**
  - [ ] Full email displays
  - [ ] Subject, from, to, date
  - [ ] Email body rendered
  - [ ] Tracking info (opened, clicked)
  - [ ] Reply button (if inbound)

### 3. Email Composition (if exists)
- [ ] **Compose New Email**
  - [ ] To field (autocomplete prospects?)
  - [ ] Subject field
  - [ ] Body editor
  - [ ] Personalization variables work
  - [ ] Preview button
  - [ ] Send button
  - [ ] Save draft button

---

## 📬 E. Campaigns Pages

### 1. Campaigns List (`/outreach/campaigns`)
- [ ] **Campaign Cards**
  - [ ] Name, description
  - [ ] Status (active/paused)
  - [ ] Stats (sent, replies, leads)
  - [ ] Actions menu

- [ ] **Filters**
  - [ ] Active/Paused/All
  - [ ] Search by name

- [ ] **Create Campaign Button**
  - [ ] Opens form or navigates to /new

### 2. Create Campaign (`/outreach/campaigns/new`)
- [ ] **Campaign Details Form**
  - [ ] Name (required)
  - [ ] Description
  - [ ] Send schedule (days)
  - [ ] Send time window
  - [ ] Daily limit
  - [ ] Validation works
  - [ ] Submit creates campaign

- [ ] **Personalization Toolbar** (if on this page)
  - [ ] Variable buttons display
  - [ ] Click inserts at cursor
  - [ ] Color-coded categories
  - [ ] Preview mode works
  - [ ] Help section clear

### 3. Campaign Detail (`/outreach/campaigns/[id]`)
- [ ] **Tabs**
  - [ ] Sequences tab loads
  - [ ] Leads tab loads
  - [ ] Settings tab loads
  - [ ] Analytics tab (if exists)

- [ ] **Sequences Tab**
  - [ ] List all email steps
  - [ ] Add new step button
  - [ ] Edit step
  - [ ] Delete step
  - [ ] Reorder steps (drag-drop?)
  - [ ] Step preview

- [ ] **Leads Tab**
  - [ ] List all campaign leads
  - [ ] Status indicators
  - [ ] Progress (current step)
  - [ ] Add leads button
  - [ ] Remove leads
  - [ ] Pause/resume leads

- [ ] **Settings Tab**
  - [ ] Edit campaign settings
  - [ ] Activate/pause campaign
  - [ ] Delete campaign (with confirmation)

---

## 📮 F. Mailboxes Page (`/outreach/mailboxes`)

### 1. Mailbox List
- [ ] **Summary Cards**
  - [ ] Total mailboxes
  - [ ] Active count
  - [ ] Daily capacity
  - [ ] Health average

- [ ] **Mailbox Cards**
  - [ ] Email, status
  - [ ] Health score with color
  - [ ] Sent today / limit
  - [ ] Total sent
  - [ ] Warmup progress
  - [ ] SMTP/IMAP verified icons
  - [ ] Action menu

### 2. Add Mailbox
- [ ] **Form Displays**
  - [ ] Account info section
  - [ ] SMTP settings section
  - [ ] IMAP settings section
  - [ ] Warmup settings section

- [ ] **Field Validation**
  - [ ] Email format
  - [ ] Port numbers
  - [ ] Required fields
  - [ ] Password fields masked

- [ ] **Submit & Test**
  - [ ] Creates mailbox
  - [ ] Auto-tests connection
  - [ ] Shows success/error

### 3. Mailbox Detail (`/outreach/mailboxes/[id]`)
- [ ] **Stats Display**
  - [ ] Sending history chart
  - [ ] Recent emails
  - [ ] Error logs

- [ ] **Actions**
  - [ ] Edit settings
  - [ ] Test connection
  - [ ] Pause/Resume
  - [ ] Delete

---

## 📊 G. Analytics Pages

### 1. Main Analytics (`/analytics` or `/outreach/analytics`)
- [ ] **Overall Metrics**
  - [ ] Email volume over time
  - [ ] Reply rate trend
  - [ ] Conversion funnel
  - [ ] Performance by campaign

- [ ] **Charts**
  - [ ] Load without errors
  - [ ] Correct data
  - [ ] Interactive (hover, click)
  - [ ] Export options

### 2. Agents Page (`/agents`)
- [ ] **Agent Cards** (one per mailbox)
  - [ ] Email address
  - [ ] Sent today
  - [ ] Total sent
  - [ ] Reply rate
  - [ ] Pipeline funnel
  - [ ] Clickable to filter

- [ ] **Summary Stats**
  - [ ] Total agents
  - [ ] Combined stats
  - [ ] Refresh button

---

## 🔍 H. Enrichment Page (`/enrichment`)

### 1. Enrichment Dashboard
- [ ] **Stats Cards**
  - [ ] Prospects needing enrichment
  - [ ] Enrichment queue size
  - [ ] Success rates
  - [ ] Recent activity

- [ ] **Start Enrichment Button**
  - [ ] Opens modal
  - [ ] Select batch size
  - [ ] Start process
  - [ ] Shows progress (real-time?)

- [ ] **Progress Indicators**
  - [ ] Current status
  - [ ] Websites found
  - [ ] Emails found
  - [ ] Errors

- [ ] **Activity Feed**
  - [ ] Recent enrichment events
  - [ ] Success/failure indicators
  - [ ] Details on click

---

## 🧰 I. Settings & Admin Pages

### 1. Settings Page (`/settings`)
- [ ] **General Settings**
  - [ ] Business hours
  - [ ] Timezone
  - [ ] Daily limits
  - [ ] Save button works

- [ ] **Email Settings**
  - [ ] Default from name
  - [ ] Reply-to address
  - [ ] Email signature

- [ ] **Warmup Settings**
  - [ ] Enable/disable
  - [ ] Warmup schedule
  - [ ] Max daily sends

- [ ] **API Keys**
  - [ ] List configured APIs
  - [ ] Test connection buttons
  - [ ] Masked keys
  - [ ] Update keys

### 2. Mystery Shopper (`/mystery-shopper`)
- [ ] **Queue Display**
  - [ ] Pending inquiries
  - [ ] Sent inquiries
  - [ ] Responses received

- [ ] **Send Inquiry**
  - [ ] Select hotels
  - [ ] Customize message
  - [ ] Send

### 3. Sales Navigator (`/sales-navigator`)
- [ ] **Import CSV**
  - [ ] Upload file
  - [ ] Preview data
  - [ ] Map columns
  - [ ] Import button

- [ ] **Import History**
  - [ ] List past imports
  - [ ] Stats per import
  - [ ] View details

---

## 📱 J. Mobile Responsiveness

### Test on Mobile Viewport (375px width)
- [ ] **All Pages**
  - [ ] Layout doesn't break
  - [ ] Text readable
  - [ ] Buttons clickable (not too small)
  - [ ] Tables scroll horizontally or stack
  - [ ] Modals fit screen

- [ ] **Navigation**
  - [ ] Hamburger menu works
  - [ ] Can access all pages
  - [ ] Close menu works

- [ ] **Forms**
  - [ ] Input fields full width
  - [ ] Dropdowns work
  - [ ] Submit buttons accessible

---

## ♿ K. Accessibility

- [ ] **Keyboard Navigation**
  - [ ] Tab through all interactive elements
  - [ ] Enter/Space activate buttons
  - [ ] Esc closes modals
  - [ ] Focus visible

- [ ] **Screen Reader**
  - [ ] Alt text on images
  - [ ] ARIA labels on buttons
  - [ ] Form labels associated

- [ ] **Color Contrast**
  - [ ] Text meets WCAG AA standards
  - [ ] Links distinguishable without color

---

## 🐛 L. Error States & Edge Cases

- [ ] **Empty States**
  - [ ] No prospects → helpful message & CTA
  - [ ] No campaigns → guide to create
  - [ ] No emails → explanation

- [ ] **Loading States**
  - [ ] Skeleton screens or spinners
  - [ ] No layout shift
  - [ ] Timeout handling

- [ ] **Error States**
  - [ ] API errors → user-friendly message
  - [ ] Network errors → retry option
  - [ ] Form errors → field-specific messages

- [ ] **Confirmation Dialogs**
  - [ ] Delete actions → "Are you sure?"
  - [ ] Bulk operations → show count
  - [ ] Destructive actions → secondary confirmation

---

## ✅ M. Acceptance Criteria

### Every Page Must:
- [ ] Load without console errors
- [ ] Display data accurately
- [ ] Handle loading states
- [ ] Handle empty states
- [ ] Handle error states
- [ ] Work on mobile
- [ ] Be keyboard accessible
- [ ] Have working navigation

### Every Button Must:
- [ ] Be clickable
- [ ] Have proper hover state
- [ ] Show loading state when processing
- [ ] Provide feedback on action
- [ ] Have descriptive text or icon

### Every Form Must:
- [ ] Validate inputs
- [ ] Show error messages
- [ ] Prevent double-submit
- [ ] Clear on success
- [ ] Handle submission errors

---

## 📝 Test Results Template

```markdown
### UI Test Results - [Page Name]
**Date**: [date]
**Browser**: Chrome/Firefox/Safari

#### Functionality
- [ ] ✅ All buttons work
- [ ] ✅ Forms validate
- [ ] ✅ Data displays correctly
- [ ] ❌ Issue: [description]

#### Visual
- [ ] ✅ Layout correct
- [ ] ✅ Responsive on mobile
- [ ] ✅ Theme works (dark/light)

**Status**: 🟢 Pass / 🟡 Minor Issues / 🔴 Broken
```

---

**Next**: After completing this, move to `todo6.md` (API Endpoints Testing)
