import {describe,it,expect} from 'vitest';
import {sameYouTubeDestination} from './youtube';
describe('YouTube destination verification',()=>{
 const search='https://www.youtube.com/results?search_query=Casa%20Tupka%20Honey%20Singh';
 it('accepts a rewritten URL only for the same query on the same origin',()=>{
  expect(sameYouTubeDestination('https://www.youtube.com/results?sp=filter&search_query=Casa+Tupka+Honey+Singh',search)).toBe(true);
  expect(sameYouTubeDestination('https://www.youtube.com/results?search_query=Something+else',search)).toBe(false);
  expect(sameYouTubeDestination(search+'&search_query=Other',search)).toBe(false);
  expect(sameYouTubeDestination(search.replace('www.youtube.com','www.youtube.com.example.org'),search)).toBe(false);
  expect(sameYouTubeDestination(search.replace('/results','/watch'),search)).toBe(false);
 });
 it('requires the selected video, not a playlist or a different ID',()=>{
  const watch='https://www.youtube.com/watch?v=abcdefghijk';
  expect(sameYouTubeDestination(watch+'&si=test',watch)).toBe(true);
  expect(sameYouTubeDestination(watch+'&list=other',watch)).toBe(false);
  expect(sameYouTubeDestination(watch.replace('abcdefghijk','lmnopqrstuv'),watch)).toBe(false);
 });
});
