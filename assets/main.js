var challenge_list = new Array();
var team_data = new Array();

const div_row_container_class = "ctfd-live-plugin-row-container";
const div_header_id = "ctfd-live-plugin-header";
const div_challenge_header_class = "ctfd-live-plugin-challenge-header";
const div_team_class = "ctfd-live-plugin-team";
const div_team_id_prefix = "ctfd-live-plugin-team-";
const div_name_class = "ctfd-live-plugin-teamname";
const div_score_class = "ctfd-live-plugin-teamscore";
const div_challenge_class = "ctfd-live-plugin-challenge";
const div_user_container_class = "ctfd-live-plugin-user-container";
const div_user_id_prefix = "ctfd-live-plugin-user-";
const user_animation_duration_ms = 5000;

eventSource = new EventSource("/events");
eventSource.addEventListener("live",
                             event => {
                                ev = JSON.parse(event.data);
                                switch (ev.message) {
                                    case "challenge_opened":
                                        user_not_found = true;
                                        team_data.forEach(
                                            team => {
                                                d = team.views.filter(v => v.user_id == ev.user_id)[0];
                                                if (d) {
                                                    d.challenge = ev.challenge_id;
                                                    user_not_found = false;
                                                }
                                            }
                                        );
                                        if (user_not_found) {
                                            update();
                                        } else {
                                            update_dom();
                                        }
                                        break;
                                    case "challenge_failed":
                                        user_animation(ev.user_id, "failed");
                                        break;
                                    case "challenge_solved":
                                        user_animation(ev.user_id, "solved");
                                        update();
                                        break;
                                }
                             },
                             false);

async function fetch_data() {
    const challenges = await fetch("/api/v1/challenges", {method: "GET"})
                                  .then(response => response.json());
    const scores = await fetch("/api/v1/scoreboard/top/10", {method: "GET"})
                              .then(response => response.json());
    const views = await fetch("/api/v1/live/challenge_views", {method: "GET"})
                              .then(response => response.json());

    challenge_list = challenges.data.sort((a, b) => a.value - b.value).sort((a, b) => a.category.localeCompare(b.category));
    var ranks = Object.keys(scores.data).sort();
    return [challenge_list, ranks.map(rank => {
                     score = scores.data[rank];
                     team_challenges = challenge_list.map(c => ({...c, "solved": score.solves.map(s => s.challenge_id).includes(c.id)}));
                     team_challenges_map = new Map();
                     team_challenges.forEach(c => {team_challenges_map.set(c.id, c)});
                     return {"team_id": score.id,
                             "team_name": score.name,
                             "challenges": team_challenges_map,
                             "views": views.data.filter(v => v.team_id == score.id),
                             "score": score.solves.map(s => s.value).reduce((x, y) => x + y, 0)
                             }
                     })];
}

function update_dom() {
    var container = document.getElementById("ctfd-live-plugin-container")
    var disappearing_div = Array.from(container.getElementsByClassName(div_team_class)).filter(d => !team_data.map(t => "ctfd-live-plugin-team-" + t.team_id).includes(d.id));
    disappearing_div.forEach(d => {console.log("delete!");d.remove();});

    var div_header = document.getElementById(div_header_id);
    if (!div_header) {
        div_header = document.createElement('div');
        div_header.id = div_header_id;
        div_header.className = div_row_container_class;
        var div_name_dummy = document.createElement('div');
        div_name_dummy.className = div_name_class;
        div_name_dummy.style = "visibility: hidden;";
        div_header.appendChild(div_name_dummy);
        var div_score_dummy = document.createElement('div');
        div_score_dummy.className = div_score_class;
        div_score_dummy.style = "visibility: hidden;";
        div_header.appendChild(div_score_dummy);
        console.log("CREATE_ELEMENT " + div_header.outerHTML);
        container.appendChild(div_header);
    }
    challenge_list.forEach(c => {
        var div_challenge = Array.from(container.getElementsByClassName(div_challenge_header_class)).filter(x => x.getAttribute("data-challenge-id") == c.id)[0];
        if (!div_challenge) {
            div_challenge = document.createElement('div');
            div_challenge.className = div_challenge_header_class;
            div_challenge.setAttribute("data-challenge-id", c.id);
            console.log("CREATE_ELEMENT " + div_challenge.outerHTML);
            div_header.appendChild(div_challenge);
        }
        div_challenge.textContent = c.category + '/' + c.name;
    });

    team_data.forEach(function(team, i){
        const div_team_id = div_team_id_prefix + team.team_id;
        var div_team = document.getElementById(div_team_id);
        if (!div_team) {
            div_team = document.createElement('div');
            div_team.id = div_team_id;
            console.log("CREATE_ELEMENT " + div_team.outerHTML);
            container.appendChild(div_team);
        }
        div_team.classList.add(div_row_container_class, div_team_class);
        div_team.setAttribute("data-order", i + 1);

        var div_name = div_team.getElementsByClassName(div_name_class)[0];
        if (!div_name) {
            div_name = document.createElement('div');
            div_name.className = div_name_class;
            console.log("CREATE_ELEMENT " + div_name.outerHTML);
            div_team.appendChild(div_name);
        }
        div_name.textContent = team.team_name;

        var div_score = div_team.getElementsByClassName(div_score_class)[0];
        if (!div_score) {
            div_score = document.createElement('div');
            div_score.className = div_score_class;
            console.log("CREATE_ELEMENT " + div_score.outerHTML);
            div_team.appendChild(div_score);
        }
        div_score.textContent = team.score;

        challenge_list.forEach(c => {
            var div_challenge = Array.from(div_team.getElementsByClassName(div_challenge_class)).filter(x => x.getAttribute("data-challenge-id") == c.id)[0];
            if (!div_challenge) {
                div_challenge = document.createElement('div');
                div_challenge.className = div_challenge_class;
                div_challenge.setAttribute("data-challenge-id", c.id);
                div_challenge.textContent = c.value;
                console.log("CREATE_ELEMENT " + div_challenge.outerHTML);
                div_team.appendChild(div_challenge);
            }
            div_challenge.firstChild.textContent = c.value;
            div_challenge.setAttribute("data-challenge-solved", team.challenges.get(c.id).solved ? "true" : "false");
        });

        team.views.filter(v => v.team_id == team.team_id).forEach(v => {
            const div_user_id = div_user_id_prefix + v.user_id;
            var div_user = document.getElementById(div_user_id);
            if (!div_user) {
                div_user = document.createElement('div');
                div_user.className = "ctfd-live-plugin-user";
                div_user.id = div_user_id;
                console.log("CREATE_ELEMENT " + div_user.outerHTML);
            }
            var div_challenge = Array.from(div_team.getElementsByClassName(div_challenge_class)).filter(x => x.getAttribute("data-challenge-id") == v.challenge)[0];
            var div_user_container = div_challenge.getElementsByClassName(div_user_container_class)[0];
            if (!div_user_container) {
                div_user_container = document.createElement('div');
                div_user_container.className = div_user_container_class;
                div_challenge.appendChild(div_user_container);
            }
            div_user_container.appendChild(div_user);
            div_user.setAttribute("data-username", v.user_name);
        });
    });
}

function user_animation(user_id, state) {
    var div_user = document.getElementById('ctfd-live-plugin-user-' + user_id);
    div_user.setAttribute("data-attempt", state);
    setTimeout(() => {div_user.removeAttribute("data-attempt");}, user_animation_duration_ms);
}

function update() {
    fetch_data().then(([c, t]) => {challenge_list = c; team_data = t; update_dom()});
}

update();
