import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("policy_run", Path(__file__).with_name("run.py"))
policy_run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy_run)


class PublishedActionTests(unittest.TestCase):
    def test_recipe_resolves_inside_the_downloaded_action(self):
        argv = policy_run.recipe_command(["preflyt-recipe", "tests.required", "results/tests.xml"])
        self.assertEqual(Path(argv[1]), Path(__file__).resolve().with_name("recipes.py"))
        self.assertEqual(argv[2:], ["tests.required", "results/tests.xml"])
        for invalid in [["preflyt-recipe"], ["preflyt-recipe", "invented", "x"]]:
            with self.assertRaises(ValueError):
                policy_run.recipe_command(invalid)

    def test_recipe_and_custom_commands_are_distinguished(self):
        self.assertTrue(policy_run.is_recipe(["preflyt-recipe", "tests.required", "x"]))
        self.assertTrue(policy_run.is_recipe(["python3", ".github/actions/preflyt-policy/recipes.py", "tests.required", "x"]))
        self.assertFalse(policy_run.is_recipe(["python3", "user-tool.py"]))
        self.assertEqual(policy_run.recipe_command(["npm", "test"]), ["npm", "test"])

    def test_commands_do_not_receive_oidc_or_platform_credentials(self):
        with tempfile.TemporaryDirectory() as workspace:
            env = {"GITHUB_WORKSPACE": workspace, "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "private", "GITHUB_TOKEN": "private", "GH_TOKEN": "private", "PREFLYT_API_URL": "private", "PATH": os.environ["PATH"]}
            with patch.dict(os.environ, env, clear=True), patch.object(policy_run.subprocess, "Popen") as popen, patch.object(policy_run.os, "killpg"):
                popen.return_value.wait.return_value = 0
                self.assertEqual(policy_run.command_run(["preflyt-recipe", "tests.required", "results.xml"]), 0)
                command = popen.call_args.args[0]
                self.assertTrue(Path(command[1]).is_absolute())
                passed_env = popen.call_args.kwargs["env"]
                for secret in ["ACTIONS_ID_TOKEN_REQUEST_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "PREFLYT_API_URL"]:
                    self.assertNotIn(secret, passed_env)


if __name__ == "__main__":
    unittest.main()
