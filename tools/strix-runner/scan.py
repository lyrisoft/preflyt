import os
os.environ['STRIX_RUNTIME_BACKEND']='preflyt'
os.environ['STRIX_TELEMETRY']='false'
os.environ['LLM_DISABLE_STREAMING']='true'
os.environ['LLM_TIMEOUT']='600'
os.environ['STRIX_FORCE_REQUIRED_TOOL_CHOICE']='true'
from model_profile import configure
configure(os.environ)
from sandbox import register
register()
from strix.core import runner as engine
from bounded_scan import install
from strix.agents import factory
from source_inspection import register as register_source_tools
inspection=register_source_tools(factory)
install(engine, factory, inspection)
from strix.interface.main import main
main()
