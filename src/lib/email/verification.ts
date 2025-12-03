/**
 * Email Verification & Bounce Detection
 *
 * Features:
 * 1. Syntax validation
 * 2. Domain MX record check
 * 3. Disposable email detection
 * 4. Bounce tracking from SMTP errors
 * 5. Domain reputation checking
 */

import * as dns from 'dns';
import { promisify } from 'util';
import { createServerClient } from '@/lib/supabase';
import { logger } from '../logger';

const resolveMx = promisify(dns.resolveMx);

// Comprehensive disposable email domains list (500+ domains)
const DISPOSABLE_DOMAINS = new Set([
  // Most common disposable services
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  '10minutemail.com', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'getnada.com', 'maildrop.cc', 'mohmal.com', 'dispostable.com',
  'mailnesia.com', 'mintemail.com', 'tempail.com', 'tempr.email',

  // Extended list A-D
  '20minutemail.com', '33mail.com', 'anonbox.net', 'anonymbox.com',
  'antispam.de', 'armyspy.com', 'binkmail.com', 'bobmail.info',
  'bugmenot.com', 'bumpymail.com', 'buyusedlibrarybooks.org', 'byom.de',
  'cashette.com', 'cheatmail.de', 'cko.kr', 'cool.fr.nf', 'correo.blogos.net',
  'cosmorph.com', 'courriel.fr.nf', 'crazymailing.com', 'cubiclink.com',
  'curryworld.de', 'cuvox.de', 'dacoolest.com', 'dandikmail.com',
  'deadaddress.com', 'despam.it', 'despammed.com', 'devnullmail.com',
  'dfgh.net', 'digitalsanctuary.com', 'discardmail.com', 'discardmail.de',
  'disposable.com', 'disposableaddress.com', 'disposableemailaddresses.com',
  'disposableinbox.com', 'dispose.it', 'disposemail.com', 'dispostable.com',
  'dm.w3internet.co.uk', 'dodgeit.com', 'dodgemail.de', 'dodgit.com',
  'dontreg.com', 'dontsendmespam.de', 'dumpmail.de', 'dumpyemail.com',

  // Extended list E-H
  'e4ward.com', 'easytrashmail.com', 'einmalmail.de', 'email60.com',
  'emaildrop.io', 'emailigo.de', 'emailinfive.com', 'emaillime.com',
  'emailmiser.com', 'emailsensei.com', 'emailtemporanea.com', 'emailtemporanea.net',
  'emailtemporar.ro', 'emailtemporario.com.br', 'emailthe.net', 'emailtmp.com',
  'emailto.de', 'emailwarden.com', 'emailx.at.hm', 'emailxfer.com',
  'emeil.in', 'emeil.ir', 'emz.net', 'enterto.com', 'ephemail.net',
  'etranquil.com', 'etranquil.net', 'etranquil.org', 'evopo.com',
  'explodemail.com', 'express.net.ua', 'eyepaste.com', 'fakeinbox.cf',
  'fakeinbox.com', 'fakeinbox.ga', 'fakeinbox.gq', 'fakeinbox.ml',
  'fakeinbox.tk', 'fakemailgenerator.com', 'fastacura.com', 'fastchevy.com',
  'fastchrysler.com', 'fastkawasaki.com', 'fastmazda.com', 'fastmitsubishi.com',
  'fastnissan.com', 'fastsubaru.com', 'fastsuzuki.com', 'fasttoyota.com',
  'fastyamaha.com', 'filzmail.com', 'fixmail.tk', 'flashbox.5july.org',
  'flyspam.com', 'footard.com', 'forgetmail.com', 'fr33mail.info',
  'frapmail.com', 'freundin.ru', 'friendlymail.co.uk', 'front14.org',
  'fuckingduh.com', 'fudgerub.com', 'fux0ringduh.com', 'garliclife.com',
  'gehensiull.com', 'get1mail.com', 'get2mail.fr', 'getairmail.com',
  'getmails.eu', 'getonemail.com', 'getonemail.net', 'ghosttexter.de',
  'girlsundertheinfluence.com', 'gishpuppy.com', 'goemailgo.com',
  'gorillaswithdirtyarmpits.com', 'gotmail.com', 'gotmail.net', 'gotmail.org',
  'gotti.otherinbox.com', 'gowikibooks.com', 'gowikicampus.com',
  'gowikicars.com', 'gowikifilms.com', 'gowikigames.com', 'gowikimusic.com',
  'great-host.in', 'greensloth.com', 'grr.la', 'guerillamail.biz',
  'guerillamail.com', 'guerillamail.de', 'guerillamail.info', 'guerillamail.net',
  'guerillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.info',
  'guerrillamail.net', 'guerrillamail.org', 'gustr.com', 'h.mintemail.com',
  'hab-verschansen.de', 'habmalnansen.de', 'hacccc.com', 'haltospam.com',
  'harakirimail.com', 'hartbot.de', 'hat-gansen.de', 'hatespam.org',
  'herp.in', 'hidemail.de', 'hidzz.com', 'hmamail.com', 'hochsitze.com',
  'hopemail.biz', 'hotpop.com', 'hulapla.de', 'hushmail.me',

  // Extended list I-M
  'ieatspam.eu', 'ieatspam.info', 'ieh-mail.de', 'ignoremail.com',
  'ihateyoualot.info', 'iheartspam.org', 'imails.info', 'imgof.com',
  'imgv.de', 'incognitomail.com', 'incognitomail.net', 'incognitomail.org',
  'infocom.zp.ua', 'inoutmail.de', 'inoutmail.eu', 'inoutmail.info',
  'inoutmail.net', 'insorg-mail.info', 'instant-mail.de', 'ipoo.org',
  'irish2me.com', 'iwi.net', 'jetable.com', 'jetable.fr.nf', 'jetable.net',
  'jetable.org', 'jnxjn.com', 'jourrapide.com', 'jsrsolutions.com',
  'junk1.com', 'kasmail.com', 'kaspop.com', 'killmail.com', 'killmail.net',
  'kimsdisk.com', 'kingsq.ga', 'kiois.com', 'kir.ch.tc', 'klassmaster.com',
  'klassmaster.net', 'klzlv.com', 'kulturbetrieb.info', 'kurzepost.de',
  'lawlita.com', 'letthemeatspam.com', 'lhsdv.com', 'lifebyfood.com',
  'link2mail.net', 'litedrop.com', 'loadby.us', 'login-email.ml',
  'lol.ovpn.to', 'lookugly.com', 'lopl.co.cc', 'lortemail.dk',
  'lovemeleaveme.com', 'lr78.com', 'lroid.com', 'lukop.dk', 'm21.cc',
  'm4ilweb.info', 'maboard.com', 'mail-hierarchie.net', 'mail-temporaire.fr',
  'mail114.net', 'mail2rss.org', 'mail333.com', 'mail4trash.com',
  'mailbidon.com', 'mailblocks.com', 'mailbucket.org', 'mailcat.biz',
  'mailcatch.com', 'mailde.de', 'mailde.info', 'maildrop.cc', 'maildrop.gq',
  'maildx.com', 'mailed.ro', 'maileater.com', 'mailexpire.com',
  'mailfa.tk', 'mailforspam.com', 'mailfree.ga', 'mailfree.gq',
  'mailfree.ml', 'mailfreeonline.com', 'mailguard.me', 'mailhazard.com',
  'mailhazard.us', 'mailhz.me', 'mailimate.com', 'mailin8r.com',
  'mailinater.com', 'mailinator.co.uk', 'mailinator.com', 'mailinator.gq',
  'mailinator.info', 'mailinator.net', 'mailinator.org', 'mailinator.us',
  'mailinator2.com', 'mailincubator.com', 'mailismagic.com', 'mailjunk.cf',
  'mailjunk.ga', 'mailjunk.gq', 'mailjunk.ml', 'mailjunk.tk', 'mailmate.com',
  'mailme.gq', 'mailme.ir', 'mailme.lv', 'mailme24.com', 'mailmetrash.com',
  'mailmoat.com', 'mailnator.com', 'mailnesia.com', 'mailnull.com',
  'mailorg.org', 'mailpick.biz', 'mailquack.com', 'mailrock.biz',
  'mailsac.com', 'mailscrap.com', 'mailseal.de', 'mailshell.com',
  'mailsiphon.com', 'mailslapping.com', 'mailslite.com', 'mailspam.xyz',
  'mailtemp.info', 'mailtome.de', 'mailtothis.com', 'mailtrash.net',
  'mailtv.net', 'mailtv.tv', 'mailzilla.com', 'mailzilla.org', 'mailzilla.orgmbx.cc',
  'makemetheking.com', 'manybrain.com', 'mbx.cc', 'mega.zik.dj',
  'meinspamschutz.de', 'meltmail.com', 'messagebeamer.de', 'mezimages.net',
  'mierdamail.com', 'migmail.pl', 'migumail.com', 'mintemail.com',
  'mjukgansen.nu', 'moakt.com', 'mobi.web.id', 'mobileninja.co.uk',
  'moburl.com', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'monumentmail.com', 'msa.minsmail.com', 'msb.minsmail.com', 'mscold.com',
  'msg.mailinator.com', 'mspam.eu', 'mspeciosa.com', 'mswork.ru',
  'mt2009.com', 'mt2014.com', 'myalias.pw', 'mycleaninbox.net',
  'myemailboxy.com', 'mykickassideas.com', 'mymailoasis.com', 'mynetstore.de',
  'mypacks.net', 'mypartyclip.de', 'myphantomemail.com', 'myspaceinc.com',
  'myspaceinc.net', 'myspacepimpedup.com', 'myspamless.com', 'mytempemail.com',
  'mytempmail.com', 'mytrashmail.com', 'mywarnernet.net', 'myzx.com',

  // Extended list N-S
  'neomailbox.com', 'nepwk.com', 'nervmich.net', 'nervtmansen.de',
  'netmails.com', 'netmails.net', 'netzidiot.de', 'neverbox.com',
  'nice-4u.com', 'nincsmail.hu', 'nmail.cf', 'nobulk.com', 'noclickemail.com',
  'nogmailspam.info', 'nomail.xl.cx', 'nomail2me.com', 'nomorespamemails.com',
  'nonspam.eu', 'nonspammer.de', 'noref.in', 'nospam.ze.tc', 'nospam4.us',
  'nospamfor.us', 'nospammail.net', 'nospamthanks.info', 'notmailinator.com',
  'nowmymail.com', 'nurfuerspam.de', 'nus.edu.sg', 'nwldx.com', 'nypato.com',
  'objectmail.com', 'ohaaa.de', 'olypmall.ru', 'omaninfo.com', 'oneoffemail.com',
  'onewaymail.com', 'online.ms', 'oopi.org', 'opayq.com', 'ordinaryamerican.net',
  'otherinbox.com', 'ourklips.com', 'outlawspam.com', 'ovpn.to', 'owlpic.com',
  'pancakemail.com', 'paplease.com', 'pcusers.otherinbox.com', 'pepbot.com',
  'pfui.ru', 'pimpedupmyspace.com', 'pjjkp.com', 'plexolan.de',
  'pochta.ru', 'poczta.onet.pl', 'politikerclub.de', 'pookmail.com',
  'privacy.net', 'privatdemail.net', 'privy-mail.com', 'privymail.de',
  'prtnx.com', 'proxymail.eu', 'prtnx.com', 'punkass.com', 'putthisinyourspamdatabase.com',
  'qq.com', 'quickinbox.com', 'quickmail.nl', 'rainmail.biz', 'rcpt.at',
  're-gister.com', 'reallymymail.com', 'realtyalerts.ca', 'recode.me',
  'reconmail.com', 'recursor.net', 'recyclemail.dk', 'regbypass.com',
  'regbypass.comsafe-mail.net', 'rejectmail.com', 'remail.cf', 'remail.ga',
  'rhyta.com', 'rklips.com', 'rmqkr.net', 'royal.net', 'rppkn.com',
  'rtrtr.com', 's0ny.net', 'safe-mail.net', 'safetymail.info', 'safetypost.de',
  'sandelf.de', 'saynotospams.com', 'schafmail.de', 'schrott-email.de',
  'secretemail.de', 'secure-mail.biz', 'secure-mail.cc', 'selfdestructingmail.com',
  'sendspamhere.com', 'senseless-entertainment.com', 'server.ms.selfip.net',
  'sharklasers.com', 'shieldemail.com', 'shiftmail.com', 'shitmail.me',
  'shortmail.net', 'shut.name', 'shut.ws', 'sibmail.com', 'sinnlos-mail.de',
  'siteposter.net', 'skeefmail.com', 'slaskpost.se', 'slave-auctions.net',
  'slopsbox.com', 'slushmail.com', 'smashmail.de', 'smellfear.com',
  'snakemail.com', 'sneakemail.com', 'sneakmail.de', 'snkmail.com',
  'sofimail.com', 'sofort-mail.de', 'softpls.asia', 'sogetthis.com',
  'sohu.com', 'solvemail.info', 'soodonims.com', 'spam.la', 'spam.su',
  'spam4.me', 'spamail.de', 'spamarrest.com', 'spamavert.com', 'spambob.com',
  'spambob.net', 'spambob.org', 'spambog.com', 'spambog.de', 'spambog.ru',
  'spambox.info', 'spambox.irishspringrealty.com', 'spambox.us', 'spamcannon.com',
  'spamcannon.net', 'spamcero.com', 'spamcon.org', 'spamcorptastic.com',
  'spamcowboy.com', 'spamcowboy.net', 'spamcowboy.org', 'spamday.com',
  'spamex.com', 'spamfree.eu', 'spamfree24.com', 'spamfree24.de',
  'spamfree24.eu', 'spamfree24.info', 'spamfree24.net', 'spamfree24.org',
  'spamgoes.in', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'spamherelots.com', 'spamhereplease.com', 'spamhole.com', 'spamify.com',
  'spaminator.de', 'spamkill.info', 'spaml.com', 'spaml.de', 'spamlot.net',
  'spammotel.com', 'spamobox.com', 'spamoff.de', 'spamsalad.in',
  'spamslicer.com', 'spamspot.com', 'spamstack.net', 'spamthis.co.uk',
  'spamthisplease.com', 'spamtrail.com', 'spamtroll.net', 'speed.1s.fr',
  'spoofmail.de', 'squizzy.de', 'ssoia.com', 'startkeys.com', 'stexsy.com',
  'stinkefinger.net', 'stop-my-spam.cf', 'stop-my-spam.com', 'stop-my-spam.ga',
  'stop-my-spam.ml', 'stop-my-spam.tk', 'streetwisemail.com', 'stuffmail.de',
  'supergreatmail.com', 'supermailer.jp', 'superrito.com', 'superstachel.de',
  'suremail.info', 'svk.jp',

  // Extended list T-Z
  'tafmail.com', 'taglead.com', 'tagmymedia.com', 'tagyourself.com',
  'talkinator.com', 'tapchicuoihoi.com', 'techemail.com', 'techgroup.me',
  'teewars.org', 'telecomix.pl', 'tellos.xyz', 'temp-mail.de', 'temp-mail.ru',
  'temp.bartdevos.be', 'temp.headstrong.de', 'tempalias.com', 'tempe-mail.com',
  'tempemail.biz', 'tempemail.co.za', 'tempemail.com', 'tempemail.net',
  'tempinbox.co.uk', 'tempinbox.com', 'tempmail.co', 'tempmail.de',
  'tempmail.eu', 'tempmail.it', 'tempmail.net', 'tempmail.us', 'tempmail2.com',
  'tempmaildemo.com', 'tempmailer.com', 'tempmailer.de', 'tempomail.fr',
  'temporarily.de', 'temporarioemail.com.br', 'temporaryemail.net',
  'temporaryemail.us', 'temporaryforwarding.com', 'temporaryinbox.com',
  'tempsky.com', 'tempthe.net', 'tempymail.com', 'thanksnospam.info',
  'thankyou2010.com', 'thecloudindex.com', 'thelimestones.com', 'thisisnotmyrealemail.com',
  'thismail.net', 'thismail.ru', 'throam.com', 'throwam.com', 'throwawayemailaddress.com',
  'throwawaymail.com', 'tilien.com', 'tittbit.in', 'tmailinator.com',
  'tmail.ws', 'toiea.com', 'tokenmail.de', 'toomail.biz', 'topranklist.de',
  'tradermail.info', 'trash-amil.com', 'trash-mail.at', 'trash-mail.cf',
  'trash-mail.com', 'trash-mail.de', 'trash-mail.ga', 'trash-mail.gq',
  'trash-mail.ml', 'trash-mail.tk', 'trash2009.com', 'trash2010.com',
  'trash2011.com', 'trashbox.eu', 'trashdevil.com', 'trashdevil.de',
  'trashemail.de', 'trashmail.at', 'trashmail.com', 'trashmail.de',
  'trashmail.io', 'trashmail.me', 'trashmail.net', 'trashmail.org',
  'trashmail.ws', 'trashmailer.com', 'trashymail.com', 'trashymail.net',
  'trbvm.com', 'trbvn.com', 'trialmail.de', 'trickmail.net', 'trillianpro.com',
  'tryalert.com', 'turual.com', 'twinmail.de', 'twoweirdtricks.com',
  'tyldd.com', 'uggsrock.com', 'umail.net', 'upliftnow.com', 'uplipht.com',
  'uroid.com', 'us.af', 'valemail.net', 'venompen.com', 'veryrealemail.com',
  'viditag.com', 'viralplays.com', 'vkcode.ru', 'vpn.st', 'vsimcard.com',
  'vubby.com', 'wasteland.rfc822.org', 'webemail.me', 'webm4il.info',
  'webuser.in', 'wee.my', 'weg-werf-email.de', 'wegwerf-email.at',
  'wegwerf-email.de', 'wegwerf-email.net', 'wegwerf-emails.de', 'wegwerfadresse.de',
  'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.info',
  'wegwerfmail.net', 'wegwerfmail.org', 'wetrainbayarea.com', 'wetrainbayarea.org',
  'wh4f.org', 'whatiaas.com', 'whatpaas.com', 'whopy.com', 'whtjddn.33mail.com',
  'whyspam.me', 'wilemail.com', 'willhackforfood.biz', 'willselfdestruct.com',
  'winemaven.info', 'wolfsmail.tk', 'writeme.com', 'wronghead.com',
  'wuzup.net', 'wuzupmail.net', 'wwwnew.eu', 'x.ip6.li', 'xagloo.com',
  'xemaps.com', 'xents.com', 'xmaily.com', 'xoxy.net', 'yapped.net',
  'yeah.net', 'yep.it', 'yogamaven.com', 'yopmail.com', 'yopmail.fr',
  'yopmail.net', 'yourdomain.com', 'ypmail.webarnak.fr.eu.org', 'yuurok.com',
  'z1p.biz', 'za.com', 'zehnminuten.de', 'zehnminutenmail.de', 'zetmail.com',
  'zippymail.info', 'zoaxe.com', 'zoemail.com', 'zoemail.net', 'zoemail.org',
  'zomg.info', 'zxcv.com', 'zxcvbnm.com', 'zzz.com',
]);

// Role-based emails that often bounce or are ignored (expanded list)
const ROLE_BASED_PREFIXES = [
  // No-reply variants
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'no_reply',
  'donot-reply', 'noreply-', 'no.reply', 'bounce', 'bounces',

  // System/daemon accounts
  'mailer-daemon', 'mailer', 'daemon', 'postmaster', 'root', 'system',
  'sysadmin', 'hostmaster', 'usenet', 'news', 'ftp', 'uucp',

  // Web/tech accounts
  'webmaster', 'webadmin', 'www', 'web', 'listserv', 'list',
  'majordomo', 'mailman', 'autoresponder', 'auto',

  // Security/abuse accounts
  'abuse', 'security', 'spam', 'phishing', 'cert', 'csirt',
  'soc', 'noc', 'dmarc', 'dkim', 'spf',

  // Generic departmental accounts
  'support', 'help', 'helpdesk', 'customerservice', 'customercare',
  'admin', 'administrator', 'info', 'information', 'contact',
  'hello', 'hi', 'team', 'staff', 'office', 'mail',

  // Sales/marketing (often ignored)
  'sales', 'marketing', 'pr', 'press', 'media', 'advertising',
  'ads', 'promotions', 'newsletter', 'unsubscribe', 'optout',
  'subscribe', 'subscriptions', 'notifications', 'alerts',

  // Business functions
  'billing', 'payments', 'invoice', 'invoices', 'accounting',
  'finance', 'legal', 'compliance', 'hr', 'humanresources',
  'recruiting', 'careers', 'jobs', 'employment', 'hiring',

  // Hospitality-specific (often forwarded or ignored)
  'reservations', 'bookings', 'reception', 'frontdesk', 'concierge',
  'guestservices', 'events', 'banquets', 'catering', 'weddings',

  // Generic catch-alls
  'all', 'everyone', 'company', 'general', 'enquiries', 'enquiry',
  'feedback', 'comments', 'suggestions', 'partners', 'vendors',
];

// SMTP error codes that indicate hard bounces
const HARD_BOUNCE_CODES = ['550', '551', '552', '553', '554'];
const SOFT_BOUNCE_CODES = ['421', '450', '451', '452'];

export interface EmailValidationResult {
  isValid: boolean;
  email: string;
  reason?: string;
  checks: {
    syntax: boolean;
    notDisposable: boolean;
    notRoleBased: boolean;
    hasMxRecord: boolean;
    notBounced: boolean;
    domainNotBlacklisted: boolean;
  };
  confidence: 'high' | 'medium' | 'low';
}

export interface BounceInfo {
  type: 'hard' | 'soft' | 'complaint';
  code?: string;
  message?: string;
  timestamp: Date;
}

/**
 * Validate email syntax using RFC 5322 pattern
 */
function isValidSyntax(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Check if email is from a disposable domain
 */
function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

/**
 * Check if email is a role-based address
 */
function isRoleBasedEmail(email: string): boolean {
  const localPart = email.split('@')[0]?.toLowerCase();
  return ROLE_BASED_PREFIXES.some(prefix => localPart?.startsWith(prefix));
}

/**
 * Check if domain has valid MX records
 */
async function hasMxRecords(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;

  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if email has previously bounced (hard bounce)
 */
async function hasBouncedBefore(email: string): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('email_send_log')
      .select('id')
      .eq('to_email', email.toLowerCase())
      .eq('bounce_type', 'hard')
      .limit(1);

    return (data && data.length > 0) || false;
  } catch {
    return false;
  }
}

/**
 * Check if email domain is blacklisted
 */
async function isDomainBlacklisted(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('domain_reputation')
      .select('is_blacklisted')
      .eq('domain', domain)
      .single();

    return data?.is_blacklisted || false;
  } catch {
    return false;
  }
}

/**
 * Comprehensive email validation
 */
export async function validateEmail(email: string): Promise<EmailValidationResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const result: EmailValidationResult = {
    isValid: false,
    email: normalizedEmail,
    checks: {
      syntax: false,
      notDisposable: false,
      notRoleBased: false,
      hasMxRecord: false,
      notBounced: false,
      domainNotBlacklisted: false,
    },
    confidence: 'low',
  };

  // Check 1: Syntax
  result.checks.syntax = isValidSyntax(normalizedEmail);
  if (!result.checks.syntax) {
    result.reason = 'Invalid email syntax';
    return result;
  }

  // Check 2: Not disposable
  result.checks.notDisposable = !isDisposableEmail(normalizedEmail);
  if (!result.checks.notDisposable) {
    result.reason = 'Disposable email address';
    return result;
  }

  // Check 3: Not role-based
  result.checks.notRoleBased = !isRoleBasedEmail(normalizedEmail);
  // Don't fail on role-based, just note it

  // Check 4: Has MX records (async)
  result.checks.hasMxRecord = await hasMxRecords(normalizedEmail);
  if (!result.checks.hasMxRecord) {
    result.reason = 'Domain has no MX records';
    return result;
  }

  // Check 5: Not bounced before (async)
  result.checks.notBounced = !(await hasBouncedBefore(normalizedEmail));
  if (!result.checks.notBounced) {
    result.reason = 'Email has previously hard bounced';
    return result;
  }

  // Check 6: Domain not blacklisted (async)
  result.checks.domainNotBlacklisted = !(await isDomainBlacklisted(normalizedEmail));
  if (!result.checks.domainNotBlacklisted) {
    result.reason = 'Domain is blacklisted due to high bounce rate';
    return result;
  }

  // Calculate confidence
  const passedChecks = Object.values(result.checks).filter(Boolean).length;
  if (passedChecks === 6) {
    result.confidence = 'high';
  } else if (passedChecks >= 4) {
    result.confidence = 'medium';
  } else {
    result.confidence = 'low';
  }

  result.isValid = passedChecks >= 5; // Allow one soft failure (role-based)

  return result;
}

/**
 * Parse SMTP error and detect bounce type
 */
export function parseBounceFromError(error: string): BounceInfo | null {
  const errorStr = String(error);

  // Check for hard bounce codes
  for (const code of HARD_BOUNCE_CODES) {
    if (errorStr.includes(code)) {
      return {
        type: 'hard',
        code,
        message: errorStr,
        timestamp: new Date(),
      };
    }
  }

  // Check for soft bounce codes
  for (const code of SOFT_BOUNCE_CODES) {
    if (errorStr.includes(code)) {
      return {
        type: 'soft',
        code,
        message: errorStr,
        timestamp: new Date(),
      };
    }
  }

  // Check for common bounce patterns
  const hardBouncePatterns = [
    /user.*not.*found/i,
    /mailbox.*not.*found/i,
    /address.*rejected/i,
    /recipient.*rejected/i,
    /invalid.*recipient/i,
    /no.*such.*user/i,
    /unknown.*user/i,
    /mailbox.*unavailable/i,
    /does.*not.*exist/i,
  ];

  for (const pattern of hardBouncePatterns) {
    if (pattern.test(errorStr)) {
      return {
        type: 'hard',
        message: errorStr,
        timestamp: new Date(),
      };
    }
  }

  const softBouncePatterns = [
    /try.*again.*later/i,
    /temporarily.*rejected/i,
    /mailbox.*full/i,
    /quota.*exceeded/i,
    /connection.*timed.*out/i,
    /too.*many.*connections/i,
  ];

  for (const pattern of softBouncePatterns) {
    if (pattern.test(errorStr)) {
      return {
        type: 'soft',
        message: errorStr,
        timestamp: new Date(),
      };
    }
  }

  return null;
}

/**
 * Record a bounce in the database
 */
export async function recordBounce(
  toEmail: string,
  fromInbox: string,
  emailId: string | null,
  bounceInfo: BounceInfo
): Promise<void> {
  try {
    const supabase = createServerClient();

    // Insert into email_send_log
    await supabase.from('email_send_log').insert({
      email_id: emailId,
      from_inbox: fromInbox,
      to_email: toEmail.toLowerCase(),
      status: 'bounced',
      bounce_type: bounceInfo.type,
      bounce_reason: bounceInfo.message,
      smtp_code: bounceInfo.code,
      bounced_at: bounceInfo.timestamp.toISOString(),
    });

    // Update domain reputation
    const domain = toEmail.split('@')[1]?.toLowerCase();
    if (domain) {
      await supabase.rpc('update_domain_reputation', {
        p_email: toEmail,
        p_bounced: true,
        p_complaint: false,
      });
    }

    logger.info({ email: toEmail, bounceType: bounceInfo.type }, 'Bounce recorded');
  } catch (error) {
    logger.error({ error, email: toEmail }, 'Failed to record bounce');
  }
}

/**
 * Record a successful send
 */
export async function recordSuccessfulSend(
  toEmail: string,
  fromInbox: string,
  emailId: string | null,
  messageId: string | null
): Promise<void> {
  try {
    const supabase = createServerClient();

    await supabase.from('email_send_log').insert({
      email_id: emailId,
      from_inbox: fromInbox,
      to_email: toEmail.toLowerCase(),
      status: 'sent',
      message_id: messageId,
      sent_at: new Date().toISOString(),
    });

    // Update domain reputation (successful send)
    await supabase.rpc('update_domain_reputation', {
      p_email: toEmail,
      p_bounced: false,
      p_complaint: false,
    });
  } catch (error) {
    logger.error({ error, email: toEmail }, 'Failed to record send');
  }
}

/**
 * Quick check if an email can be sent to (fast, cached check)
 */
export async function canSendTo(email: string): Promise<{ canSend: boolean; reason?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Quick syntax check
  if (!isValidSyntax(normalizedEmail)) {
    return { canSend: false, reason: 'Invalid email syntax' };
  }

  // Check disposable
  if (isDisposableEmail(normalizedEmail)) {
    return { canSend: false, reason: 'Disposable email' };
  }

  // Check bounced
  if (await hasBouncedBefore(normalizedEmail)) {
    return { canSend: false, reason: 'Previously bounced' };
  }

  // Check blacklisted domain
  if (await isDomainBlacklisted(normalizedEmail)) {
    return { canSend: false, reason: 'Domain blacklisted' };
  }

  return { canSend: true };
}
