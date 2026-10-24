from tools.tavily_tool import tavily_search 
from tools.flight_tool import search_flights

result = tavily_search("Plan a 7 days Japan trip from Bangladesh")
print(result)
# result = tavily_search("Best hotels in Egypt")
# print(result)