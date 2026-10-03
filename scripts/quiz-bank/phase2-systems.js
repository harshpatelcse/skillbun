const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(101, 2, "Which part of a small web app would you most like to build, {name}?", ["frontend","backend","fullstack","graphql_api_developer"], 'systems'),
  q(102, 2, "{name}, a mentor can help you try one programming tool. Which activity would you explore?", ["python_developer","java_developer","go_developer","rust_developer"], 'systems'),
  q(103, 2, "Your class wants an app for its phones. Which kind of project sounds interesting, {name}?", ["android","ios_developer","flutter_developer","react_native_developer"], 'systems'),
  q(104, 2, "{name}, you can try one way of creating a website. Which activity would you enjoy learning?", ["nextjs_developer","angular_developer","vue_developer","svelte_developer"], 'systems'),
  q(105, 2, "You can create a tool for a computer or the web. Which project would you choose, {name}?", ["desktop_app_developer","windows_app_developer","macos_developer","ruby_on_rails_developer"], 'systems'),
];
