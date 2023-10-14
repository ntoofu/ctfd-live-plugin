import datetime
import json

from flask import current_app, render_template, request
from flask_restx import Namespace, Resource
from sqlalchemy import func

from CTFd.api import CTFd_API_v1
from CTFd.models import Users, db
from CTFd.plugins import override_template, register_plugin_asset
from CTFd.utils.decorators import admins_only, during_ctf_time_only
from CTFd.utils.user import authed, get_current_user


class ChallengeViews(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    challenge_id = db.Column(
        db.Integer,
        db.ForeignKey("challenges.id", onupdate="CASCADE", ondelete="CASCADE"),
    )
    date = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

    def __init__(self, *args, **kwargs):
        super(ChallengeViews, self).__init__(**kwargs)


live_namespace = Namespace("challenges", description="Endpoint used by 'live' plugin")


@live_namespace.route("/challenge_views")
class LiveChallengeViews(Resource):
    @admins_only
    @during_ctf_time_only
    def get(self):
        subquery = db.session.query(
            ChallengeViews,
            func.rank()
            .over(
                order_by=ChallengeViews.date.desc(), partition_by=ChallengeViews.user_id
            )
            .label("order"),
        ).subquery()
        views = (
            db.session.query(subquery, Users.team_id, Users.name)
            .filter(subquery.c.order == 1)
            .join(Users, subquery.c.user_id == Users.id)
        )
        return {
            "success": True,
            "data": [
                {
                    "user_id": v.user_id,
                    "user_name": v.name,
                    "team_id": v.team_id,
                    "challenge": v.challenge_id,
                    "date": v.date.isoformat(),
                }
                for v in views
            ],
        }


def add_challenge_views(user_id, challenge_id):
    cv = ChallengeViews(user_id=user_id, challenge_id=challenge_id)
    db.session.add(cv)
    db.session.commit()
    return


def send_message(user_id, challenge_id, msg):
    print(f"{msg} {challenge_id} by {user_id}")  # save activity on DB & send message
    current_app.events_manager.publish(
        data={"user_id": user_id, "challenge_id": challenge_id, "message": msg},
        type="live",
    )
    return


def load(app):
    app.db.create_all()

    challenge_func_name = "api.challenges_challenge"
    attempt_func_name = "api.challenges_challenge_attempt"
    challenge_func_orig = app.view_functions[challenge_func_name]
    attempt_func_orig = app.view_functions[attempt_func_name]

    def challenge_func(*args, **kwargs):
        result = challenge_func_orig(*args, **kwargs)
        if not authed():
            return result
        if json.loads(result.get_data()).get("success"):
            if len(args) > 0:
                challenge_id = args[0]
            elif "challenge_id" in kwargs:
                challenge_id = kwargs["challenge_id"]
            else:
                return result
            user = get_current_user()
            add_challenge_views(user.id, challenge_id)
            send_message(user.id, challenge_id, "challenge_opened")
        return result

    def attempt_func(*args, **kwargs):
        result = attempt_func_orig(*args, **kwargs)
        if not authed():
            return result
        resp_data = json.loads(result.get_data())
        if request.content_type != "application/json":
            request_data = request.form
        else:
            request_data = request.get_json()
        challenge_id = request_data.get("challenge_id")
        if resp_data.get("success"):
            status = resp_data.get("data", {}).get("status")
            user = get_current_user()
            if status == "correct":
                send_message(user.id, challenge_id, "challenge_solved")
            elif status == "incorrect":
                send_message(user.id, challenge_id, "challenge_failed")
        return result

    app.view_functions[challenge_func_name] = challenge_func
    app.view_functions[attempt_func_name] = attempt_func

    register_plugin_asset(app, asset_path="/plugins/live/assets/main.js")
    register_plugin_asset(app, asset_path="/plugins/live/assets/main.css")
    override_template(
        "live.html",
        '{% extends "base.html" %}{% block scripts %}<script type="text/javascript" src="/plugins/live/assets/main.js"></script><link rel="stylesheet" type="text/css" href="/plugins/live/assets/main.css">{% endblock %}{% block content %}<h1>Live Scoreboard</h1>{{content}}<div id="ctfd-live-plugin-container"></div>{% endblock %}',
    )

    @app.route("/admin/live", methods=["GET"])
    def view_live():
        return render_template("live.html", content="")

    CTFd_API_v1.add_namespace(live_namespace, "/live")
