from django.http import HttpResponse
def index(_): 
    return HttpResponse("<h1>Employee Directory</h1><p>Alice – Engineer</p>")
