import {describe,expect,it} from 'vitest';
import {matchSavedDetails,Profile,type ProfileTarget} from './profile';
import {applicationIntent,jobMatches,isProfileCommand} from './application-intent';
const profile={firstName:'Test',lastName:'Applicant',email:'person@example.org',phone:'+1 555 010 1234'};
const field=(slot:ProfileTarget['slot'],formId='page-one'):ProfileTarget=>({slot,formId,id:slot,label:slot,action:'https://example.com/application',method:'post'});
describe('saved contact details',()=>{
 it('validates the values and keeps them in one unambiguous form',()=>{
  expect(Profile.safeParse(profile).success).toBe(true);
  expect(Profile.safeParse({...profile,email:'bad'}).success).toBe(false);
  expect(matchSavedDetails(profile,[field('fullName'),field('email'),field('phone')]).map(x=>x.value)).toEqual(['Test Applicant',profile.email,profile.phone]);
  expect(matchSavedDetails(profile,[field('email'),field('phone','form-two')])).toEqual([]);
  expect(matchSavedDetails(profile,[field('email'),field('email'),field('phone')]).map(x=>x.slot)).toEqual(['phone']);
 });
 it('does not fill full name and separate name inputs on the same form',()=>{
  expect(matchSavedDetails(profile,[field('fullName'),field('firstName'),field('lastName')]).map(x=>x.slot)).toEqual(['firstName','lastName']);
 });
 it('extracts a job target or a local profile command without contact values',()=>{
  expect(applicationIntent('Apply for the Backend Engineer role at Acme using my saved profile.')).toEqual({role:'Backend Engineer',organization:'Acme',query:'Backend Engineer Acme careers apply'});
  expect(applicationIntent('Apply for Backend Engineer at person@example.com')).toBeNull();
  expect(isProfileCommand('Fill my contact details')).toBe(true);
 });
 it('checks posting signals without treating one generic result title as sufficient',()=>{
  const page={headings:['Backend Engineer'],identity:'Acme Careers',url:'https://example.com/careers'};
  expect(jobMatches('Backend Engineer','Acme',page)).toBe(true);
  expect(jobMatches('Backend Engineer','Other',page)).toBe(false);
  expect(jobMatches('Frontend Engineer','Acme',page)).toBe(false);
 });
});
